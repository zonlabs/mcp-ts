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
  error,
  info,
  intro,
  outro,
  printBanner,
  spinner,
  step,
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

export const DEFAULT_LOCAL_MCP_PORT = 8765;

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
    for (const server of localServers) {
      treeNote(`${pc.dim("-")} ${pc.bold(server.serverName)} ${pc.dim(`(${server.tools.length} tools)`)}`);
    }
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

  const remote = args.remote ?? process.env.REMOTE_GATEWAY_URL ?? "https://api.mcp-assistant.in";
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
    });
    await bridge.start();
    step(`Connecting JSON-RPC bridge to remote gateway: ${pc.cyan(remote)}`);
  } else {
    warn("No remote session available. Local endpoint only.");
  }

  treeSummary("Gateway summary", [
    { label: "Local", value: pc.cyan(localUrl) },
    { label: "Remote", value: bridge ? pc.cyan(remote) : pc.dim("not connected") },
    {
      label: "Servers",
      value: `${localServers.map((server) => server.serverName).join(", ")} ${pc.dim(`(${registry.aggregatedTools().length} tools)`)}`,
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

  ticker(traffic.render());
}
