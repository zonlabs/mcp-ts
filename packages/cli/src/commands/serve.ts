import pc from "picocolors";
import { McpGatewayRegistry } from "../gateway/registry.js";
import { LocalHttpMcp } from "../gateway/local-http-mcp.js";
import { RemoteBridgeClient } from "../gateway/bridge-client.js";
import { Traffic } from "../traffic.js";
import { loadMcpJson } from "../gateway/config.js";
import {
  ensureFreshAuthSession,
  InvalidAuthSessionError,
  loadAuthSession,
} from "../gateway/auth-store.js";
import { loginToRemote } from "../gateway/oauth.js";
import {
  clearTicker,
  dim,
  error,
  info,
  intro,
  outro,
  printBanner,
  serverLog,
  spinner,
  success,
  ticker,
  treeNote,
  treeSummary,
  warn,
} from "../ux.js";

export interface ServeArgs {
  host?: string;
  port?: number;
  path?: string;
  remote?: string;
  login?: string;
  verbose?: boolean;
  mode?: "all" | "search";
}

import {
  DEFAULT_LOCAL_MCP_PORT,
  DEFAULT_REMOTE_GATEWAY_URL,
  DEFAULT_BRIDGE_READY_TIMEOUT_MS,
} from "../constants.js";

export { DEFAULT_LOCAL_MCP_PORT };

interface ShutdownHandlerOptions {
  cleanup(): Promise<void>;
  exit?: (code: number) => void;
  onSignal?: (signal: string) => void;
  forceAfterMs?: number;
}

export function createShutdownHandler(options: ShutdownHandlerOptions) {
  let shuttingDown = false;
  const exit = options.exit ?? ((code: number) => process.exit(code));

  return async (signal: string): Promise<void> => {
    if (shuttingDown) {
      exit(130);
      return;
    }
    shuttingDown = true;
    options.onSignal?.(signal);
    const forceExit = setTimeout(() => {
      exit(130);
    }, options.forceAfterMs ?? 1_500);
    forceExit.unref?.();

    try {
      await options.cleanup();
    } catch {
      // Ignore cleanup errors on shutdown
    } finally {
      clearTimeout(forceExit);
      exit(0);
    }
  };
}

function renderServerList(
  servers: Array<{ serverName: string; tools: unknown[] }>,
  maxDisplay = 5,
): void {
  const visible = servers.slice(0, maxDisplay);
  const remaining = servers.length - visible.length;
  for (const server of visible) {
    treeNote(
      `${pc.dim("-")} ${pc.bold(server.serverName)} ${pc.dim(`(${server.tools.length} tool${server.tools.length === 1 ? "" : "s"})`)}`,
    );
  }
  if (remaining > 0) {
    treeNote(pc.dim(`...and ${remaining} more`));
  }
}

export async function cmdServe(args: ServeArgs): Promise<void> {
  printBanner();
  intro(pc.bold("mcpa serve"));
  const target = process.cwd();
  let registry: McpGatewayRegistry | null = null;
  let localHttpMcp: LocalHttpMcp | null = null;
  let bridge: RemoteBridgeClient | null = null;

  const shutdown = createShutdownHandler({
    onSignal: (signal) => {
      clearTicker();
      warn(`Received ${signal}, shutting down...`);
    },
    cleanup: async () => {
      if (process.stdin.isTTY) {
        try {
          process.stdin.setRawMode(false);
          process.stdin.pause();
        } catch {
          // Best effort
        }
      }
      await Promise.allSettled([
        bridge?.stop(),
        localHttpMcp?.close(),
        registry?.close(),
      ]);
    },
  });
  const handleSigint = () => void shutdown("SIGINT");
  const handleSigterm = () => void shutdown("SIGTERM");
  process.on("SIGINT", handleSigint);
  process.on("SIGTERM", handleSigterm);
  process.on("exit", clearTicker);

  let localConfig: Record<string, any> = {};
  try {
    const { config } = loadMcpJson(target);
    localConfig = config.mcpServers ?? {};
  } catch {
    // Remote-only gateways do not require mcp.json.
  }

  info(`Loaded configuration with ${pc.bold(String(Object.keys(localConfig).length))} local server(s)`);
  const traffic = new Traffic({ onUpdate: () => ticker(traffic.render()) });
  registry = new McpGatewayRegistry(localConfig, traffic, { verbose: args.verbose });
  const startSpin = spinner();
  startSpin.start("Starting local MCP servers...");
  await registry.start();
  startSpin.stop("Local MCP servers started");

  const localServers = registry.getLocalCatalog().servers;
  if (localServers.length > 0) {
    success(`Started ${pc.bold(String(localServers.length))} local server(s)`);
    renderServerList(localServers, 5);
  }

  const host = args.host ?? "127.0.0.1";
  const port = args.port ?? DEFAULT_LOCAL_MCP_PORT;
  const path = args.path ?? "/mcp";
  const mode = args.mode ?? "search";
  localHttpMcp = new LocalHttpMcp(registry, { host, port, path, mode }, traffic);
  let localUrl: string;
  try {
    localUrl = await localHttpMcp.start();
  } catch (cause) {
    error(`Could not start local endpoint on ${host}:${port}${path}: ${(cause as Error).message}`);
    await registry.close();
    throw cause;
  }
  success(`Local unified MCP endpoint: ${pc.cyan(localUrl)}`);

  const remote = args.remote ?? process.env.REMOTE_GATEWAY_URL ?? DEFAULT_REMOTE_GATEWAY_URL;
  if (!loadAuthSession(remote)) {
    const signInSpin = spinner();
    signInSpin.start(`Waiting for sign-in in browser (${remote})...`);
    try {
      await loginToRemote(remote, args.login);
    } catch {
      warn("Could not authenticate with remote gateway. Continuing in local-only mode.");
    } finally {
      signInSpin.stop("Sign-in complete");
    }
  }

  let running = false;

  if (loadAuthSession(remote)) {
    bridge = new RemoteBridgeClient(registry, {
      remoteUrl: remote,
      getAccessToken: async () => {
        try {
          return (await ensureFreshAuthSession(remote)).accessToken;
        } catch (error) {
          if (!(error instanceof InvalidAuthSessionError)) throw error;
          return (await loginToRemote(remote, args.login)).accessToken;
        }
      },
      onRemoteCatalogChanged: (catalog) => {
        if (args.verbose) {
          serverLog(
            "bridge",
            `Remote catalog updated: ${catalog.servers.length} server(s)`,
          );
        }
      },
    });
    const bridgeSpin = spinner();
    bridgeSpin.start(`Connecting to remote gateway (${remote})...`);
    await bridge.start();
    const ready = await bridge.waitForReady(15_000);
    const remoteServers = registry.getRemoteCatalog().servers;
    if (ready || remoteServers.length > 0) {
      bridgeSpin.stop("Connected to remote gateway");
      if (remoteServers.length > 0) {
        success(`Connected ${pc.bold(String(remoteServers.length))} remote server(s)`);
        renderServerList(remoteServers, 5);
      }
    } else {
      bridgeSpin.stop("Remote gateway connected");
    }
  } else {
    warn("No remote session available. Local endpoint only.");
  }

  const remoteCount = registry.getRemoteCatalog().servers.length;
  const totalTools = registry.aggregatedTools().length;
  const bridgeStatus = bridge
    ? remoteCount > 0
      ? pc.cyan(remote)
      : `${pc.cyan(remote)} ${pc.dim("(syncing)")}`
    : pc.dim("disabled");

  treeSummary("Gateway summary", [
    { label: "Endpoint", value: pc.cyan(localUrl) },
    { label: "Bridge", value: bridgeStatus },
    {
      label: "Servers",
      value: `${pc.bold(String(localServers.length))} local${remoteCount > 0 ? ` + ${pc.bold(String(remoteCount))} remote` : ""} ${pc.dim(`(${totalTools} tool${totalTools === 1 ? "" : "s"})`)}`,
    },
  ]);
  outro(pc.green("Gateway running - Press Ctrl+C to stop"));

  // Put stdin into raw mode AFTER all @clack/prompts spinners/prompts finish
  // This guarantees Ctrl+C (\u0003), Ctrl+D (\u0004), or 'q' immediately triggers shutdown
  if (process.stdin.isTTY) {
    try {
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", (chunk: string | Buffer) => {
        const str = String(chunk);
        if (str.includes("\u0003") || str.includes("\u0004") || str.toLowerCase() === "q") {
          void shutdown("SIGINT");
        }
      });
    } catch {
      // Fallback to standard signal listeners
    }
  }

  running = true;
  ticker(traffic.render());
}
