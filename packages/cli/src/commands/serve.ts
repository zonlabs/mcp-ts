import pc from "picocolors";
import { McpGatewayRegistry } from "../gateway/registry.js";
import { LocalHttpMcp } from "../gateway/local-http-mcp.js";
import { RemoteBridgeClient } from "../gateway/bridge-client.js";
import { Traffic } from "../traffic.js";
import { loadMcpJson } from "../gateway/config.js";
import {
  ensureFreshAuthSession,
  extractUserInfo,
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

import { McpConfigWatcher } from "../gateway/watcher.js";
import { spawnDaemon } from "../gateway/daemon.js";

export interface ServeArgs {
  host?: string;
  port?: number;
  path?: string;
  remote?: string;
  login?: string;
  verbose?: boolean;
  mode?: "all" | "search";
  detached?: boolean;
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
  let resolveWait: (() => void) | null = null;
  const exit = options.exit ?? ((code: number) => {
    resolveWait?.();
    process.exit(code);
  });

  const handler = async (signal: string): Promise<void> => {
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

  handler.wait = () =>
    new Promise<void>((resolve) => {
      resolveWait = resolve;
    });

  return handler;
}

function renderServerList(
  servers: Array<{ serverId?: string; serverName: string; tools: unknown[] }>,
  maxDisplay = 5,
  timings?: Map<string, number>,
): void {
  const visible = servers.slice(0, maxDisplay);
  const remaining = servers.length - visible.length;
  for (const server of visible) {
    const ms = server.serverId && timings ? timings.get(server.serverId) : undefined;
    const timingStr = ms !== undefined
      ? pc.dim(` [${ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(2)}s`}]`)
      : "";
    treeNote(
      `${pc.dim("-")} ${pc.bold(server.serverName)} ${pc.dim(`(${server.tools.length} tool${server.tools.length === 1 ? "" : "s"})`)}${timingStr}`,
    );
  }
  if (remaining > 0) {
    treeNote(pc.dim(`...and ${remaining} more`));
  }
}

export async function cmdServe(args: ServeArgs): Promise<void> {
  if (args.detached) {
    try {
      const result = await spawnDaemon({
        port: args.port,
        verbose: args.verbose,
        url: args.remote,
      });
      printBanner();
      intro(pc.bold("mcpa serve (detached)"));
      success(`Daemon started in background (PID ${pc.bold(String(result.pid))})`);
      treeSummary("Daemon Details", [
        { label: "Gateway", value: pc.cyan(`http://127.0.0.1:${result.port}/mcp`) },
        { label: "Port", value: pc.bold(String(result.port)) },
        { label: "Logs", value: result.logPath },
      ]);
      outro(pc.dim("Inspect with `mcpa daemon status` or `mcpa daemon logs`"));
      return;
    } catch (err) {
      error(`Failed to start daemon: ${(err as Error).message}`);
      process.exitCode = 1;
      return;
    }
  }

  printBanner();
  intro(pc.bold("mcpa serve"));
  const target = process.cwd();
  let registry: McpGatewayRegistry | null = null;
  let localHttpMcp: LocalHttpMcp | null = null;
  let bridge: RemoteBridgeClient | null = null;
  let watcher: McpConfigWatcher | null = null;

  const shutdown = createShutdownHandler({
    onSignal: (signal) => {
      clearTicker();
      warn(`Received ${signal}, shutting down...`);
    },
    cleanup: async () => {
      watcher?.stop();
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

  info(`Config: Loaded ${pc.bold(String(Object.keys(localConfig).length))} server(s) from mcp.json`);
  const traffic = new Traffic({ verbose: args.verbose });
  const localRegistry = new McpGatewayRegistry(localConfig, traffic, { verbose: args.verbose });
  registry = localRegistry;
  const host = args.host ?? "127.0.0.1";
  const port = args.port ?? DEFAULT_LOCAL_MCP_PORT;
  const path = args.path ?? "/mcp";
  const mode = args.mode ?? "search";
  localHttpMcp = new LocalHttpMcp(localRegistry, { host, port, path, mode }, traffic);

  // Start file watcher for automatic hot-reloading on mcp.json changes
  watcher = new McpConfigWatcher(target, async (newConfig) => {
    if (registry) {
      await registry.reload(newConfig.mcpServers ?? {});
      try {
        await bridge?.publishLocalCatalog();
      } catch {
        // Best effort
      }
    }
  });
  watcher.start();

  const remote = args.remote ?? process.env.REMOTE_GATEWAY_URL ?? DEFAULT_REMOTE_GATEWAY_URL;
  if (!loadAuthSession(remote)) {
    if (process.env.MCPA_DAEMON === "1" || !process.stdin.isTTY) {
      warn("No saved remote session found. Running gateway in local-only mode.");
    } else {
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
  }

  if (loadAuthSession(remote)) {
    bridge = new RemoteBridgeClient(localRegistry, {
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
  }

  // Launch local servers and remote bridge concurrently in background
  const localStartTime = performance.now();
  const localTask = (async () => {
    await localRegistry.start();
    const url = await localHttpMcp.start();
    // Keep remote gateway informed of full local catalog once loaded
    try {
      await bridge?.publishLocalCatalog();
    } catch {
      // Best effort
    }
    return url;
  })();

  const remoteStartTime = performance.now();
  const remoteTask = (async () => {
    if (!bridge) return false;
    try {
      await bridge.start();
      return await bridge.waitForReady(DEFAULT_BRIDGE_READY_TIMEOUT_MS);
    } catch {
      return false;
    }
  })();

  // 1. Render Local Servers UI
  const startSpin = spinner();
  startSpin.start("Starting local MCP servers...");
  let localUrl: string;
  try {
    localUrl = await localTask;
  } catch (cause) {
    error(`Could not start local endpoint on ${host}:${port}${path}: ${(cause as Error).message}`);
    await localRegistry.close();
    throw cause;
  }
  const localDuration = ((performance.now() - localStartTime) / 1000).toFixed(2);
  const localServers = localRegistry.getLocalCatalog().servers;
  startSpin.stop(`Started ${pc.bold(String(localServers.length))} local server(s) ${pc.dim(`in ${localDuration}s`)}`);

  if (localServers.length > 0) {
    const timings = localRegistry.getLocalServerTimings();
    renderServerList(localServers, 5, timings);
  }

  // 2. Render Remote Bridge UI (which has already been connecting in background)
  const session = loadAuthSession(remote);
  const userInfo = extractUserInfo(session);
  const userEmail = userInfo?.email;

  if (bridge) {
    const bridgeSpin = spinner();
    bridgeSpin.start(`Connecting to remote gateway (${remote})...`);
    const ready = await remoteTask;
    const remoteDuration = ((performance.now() - remoteStartTime) / 1000).toFixed(2);
    const remoteServers = localRegistry.getRemoteCatalog().servers;
    const userSuffix = userEmail ? ` as ${pc.bold(userEmail)}` : "";
    if (ready || remoteServers.length > 0) {
      bridgeSpin.stop(`Connected to remote gateway${userSuffix}`);
      if (remoteServers.length > 0) {
        success(`Found ${pc.bold(String(remoteServers.length))} remote server(s) ${pc.dim(`in ${remoteDuration}s`)}`);
        renderServerList(remoteServers, 5);
      }
    } else {
      bridgeSpin.stop(`Connected to remote gateway${userSuffix}`);
    }
  } else {
    warn("No remote session available. Local endpoint only.");
  }

  const remoteCount = localRegistry.getRemoteCatalog().servers.length;
  const totalTools = localRegistry.aggregatedTools().length;
  const bridgeStatus = bridge
    ? remoteCount > 0
      ? pc.cyan(remote)
      : `${pc.cyan(remote)} ${pc.dim("(syncing)")}`
    : pc.dim("disabled");

  const summaryItems = [
    ...(userEmail ? [{ label: "Account", value: pc.bold(userEmail) }] : []),
    { label: "Gateway", value: pc.cyan(localUrl) },
    { label: "Bridge", value: bridgeStatus },
    {
      label: "Servers",
      value: `${pc.bold(String(localServers.length))} local${remoteCount > 0 ? ` + ${pc.bold(String(remoteCount))} remote` : ""} ${pc.dim(`(${totalTools} tool${totalTools === 1 ? "" : "s"})`)}`,
    },
  ];

  treeSummary("Gateway Summary", summaryItems);
  outro(pc.green("Gateway running - Press Ctrl+C to stop"));
  process.stdout.write(`\n${pc.bold(pc.dim("─── Activity Logs ──────────────────────────────────────────────────────────"))}\n\n`);

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

  // Keep server running until shutdown signal is received
  await shutdown.wait();
}
