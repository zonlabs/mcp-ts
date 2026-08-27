import { createHash } from "node:crypto";
import pc from "picocolors";
import type { CatalogSnapshot } from "@mcp-ts/bridge-protocol";
import { McpGatewayRegistry } from "../gateway/registry.js";
import {
  InitialCatalogBarrier,
  LocalHttpMcp,
} from "../gateway/local-http-mcp.js";
import { RemoteBridgeClient } from "../gateway/bridge-client.js";
import { Traffic } from "../traffic.js";
import { loadMcpJson } from "../gateway/config.js";
import {
  ensureFreshAuthSession,
  extractUserInfo,
  loadAuthSession,
  type AuthSession,
} from "../gateway/auth-store.js";
import {
  clearTicker,
  dim,
  error,
  fileLink,
  intro,
  outro,
  printBanner,
  serverLog,
  spinner,
  success,
  ticker,
  treeNote,
  treeSpacer,
  treeSummary,
  warn,
} from "../ux.js";

import { McpConfigWatcher } from "../gateway/watcher.js";
import { clearGatewayProcess, writeGatewayProcess } from "../gateway/daemon.js";
import {
  createGatewayGeneration,
  isGatewayGeneration,
} from "../gateway/gateway-health.js";
import { loginToRemote } from "../gateway/oauth.js";
import { confirmSignIn } from "../gateway/sign-in-prompt.js";
import { validatePort } from "../cli-options.js";

export interface ServeArgs {
  host?: string;
  port?: number;
  path?: string;
  remote?: string;
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

export function describeRemoteCatalogChanges(
  previous: CatalogSnapshot,
  current: CatalogSnapshot,
): string[] {
  const previousById = new Map(previous.servers.map((server) => [server.serverId, server]));
  const currentById = new Map(current.servers.map((server) => [server.serverId, server]));
  const messages: string[] = [];

  for (const server of current.servers) {
    if (previousById.has(server.serverId)) continue;
    messages.push(
      `Remote server connected: ${server.serverName} (${server.tools.length} tool${server.tools.length === 1 ? "" : "s"})`,
    );
  }
  for (const server of previous.servers) {
    if (currentById.has(server.serverId)) continue;
    messages.push(
      `Remote server disconnected: ${server.serverName} (${server.tools.length} tool${server.tools.length === 1 ? "" : "s"} removed)`,
    );
  }

  return messages;
}

function sessionFingerprint(session: AuthSession | null): string | null {
  if (!session) return null;
  const token = session.refreshToken || session.accessToken;
  return createHash("sha256").update(token).digest("hex");
}

export async function cmdServe(args: ServeArgs): Promise<void> {
  const requestedPort = validatePort(args.port ?? DEFAULT_LOCAL_MCP_PORT);
  printBanner();
  intro(pc.bold("mcpa serve"));
  const target = process.cwd();
  let registry: McpGatewayRegistry | null = null;
  let localHttpMcp: LocalHttpMcp | null = null;
  let bridge: RemoteBridgeClient | null = null;
  let watcher: McpConfigWatcher | null = null;
  const configuredGeneration = process.env.MCPA_GATEWAY_GENERATION;
  if (configuredGeneration !== undefined && !isGatewayGeneration(configuredGeneration)) {
    throw new Error("MCPA_GATEWAY_GENERATION must be a valid UUID generation token.");
  }
  const gatewayGeneration = configuredGeneration ?? createGatewayGeneration();

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
      clearGatewayProcess(process.pid, gatewayGeneration);
    },
  });
  const handleSigint = () => void shutdown("SIGINT");
  const handleSigterm = () => void shutdown("SIGTERM");
  process.on("SIGINT", handleSigint);
  process.on("SIGTERM", handleSigterm);
  process.on("exit", clearTicker);

  let localConfig: Record<string, any> = {};
  let localConfigPath: string | undefined;
  try {
    const { path: configPath, config } = loadMcpJson(target);
    localConfigPath = configPath;
    localConfig = config.mcpServers ?? {};
  } catch {
    // Remote-only gateways do not require mcp.json.
  }

  const traffic = new Traffic({ verbose: args.verbose });
  const localRegistry = new McpGatewayRegistry(localConfig, traffic, { verbose: args.verbose });
  registry = localRegistry;
  const host = args.host ?? "127.0.0.1";
  const port = requestedPort;
  const path = args.path ?? "/mcp";
  const mode = args.mode ?? "search";
  const initialCatalog = new InitialCatalogBarrier();
  const remote = args.remote ?? process.env.REMOTE_GATEWAY_URL ?? DEFAULT_REMOTE_GATEWAY_URL;
  const isDaemonMode = process.env.MCPA_DAEMON === "1";
  let previousRemoteCatalog: CatalogSnapshot = { servers: [] };
  let activeSessionFingerprint: string | null = null;
  let bridgeActivation: Promise<{ ready: boolean; error?: string }> | null = null;

  const activateRemote = (): Promise<{ ready: boolean; error?: string }> => {
    const currentSession = loadAuthSession(remote);
    if (!currentSession) {
      return Promise.resolve({ ready: false, error: "No saved remote session found." });
    }
    const currentFingerprint = sessionFingerprint(currentSession);
    if (bridge && bridge.isReady() && activeSessionFingerprint === currentFingerprint) {
      return Promise.resolve({ ready: true });
    }
    if (bridgeActivation) return bridgeActivation;

    const generation = initialCatalog.beginActivation();
    bridgeActivation = (async () => {
      try {
        const session = loadAuthSession(remote);
        if (!session) {
          const message = "No saved remote session found.";
          initialCatalog.settle({ state: "error", error: new Error(message) }, generation);
          return { ready: false, error: message };
        }
        const fingerprint = sessionFingerprint(session);

        if (bridge) {
          activeSessionFingerprint = null;
          await bridge.stop().catch(() => undefined);
          bridge = null;
        }

        bridge = new RemoteBridgeClient(localRegistry, {
          remoteUrl: remote,
          getAccessToken: async () => (await ensureFreshAuthSession(remote)).accessToken,
          onRemoteCatalogChanged: (catalog) => {
            for (const message of describeRemoteCatalogChanges(previousRemoteCatalog, catalog)) {
              serverLog("bridge", message, args.verbose);
            }
            previousRemoteCatalog = catalog;
          },
          onTerminalClose: () => {
            activeSessionFingerprint = null;
          },
          onReplaced: () => {
            activeSessionFingerprint = null;
            warn("This gateway's remote bridge was replaced by another long-running gateway. Remote tools were removed; stop the other gateway and reactivate this one to restore them.");
          },
        });

        await bridge.start();
        try {
          await bridge.publishLocalCatalog();
        } catch {
          // The initialization request already carries the local catalog.
        }
        const ready = await bridge.waitForReady(DEFAULT_BRIDGE_READY_TIMEOUT_MS);
        if (!ready) {
          const message = "Remote catalog initialization failed before the initial snapshot was registered.";
          initialCatalog.settle({ state: "error", error: new Error(message) }, generation);
          return { ready: false, error: message };
        }
        activeSessionFingerprint = fingerprint;
        initialCatalog.settle({ state: "ready" }, generation);
        return { ready: true };
      } catch (cause) {
        const activationError = cause instanceof Error ? cause : new Error(String(cause));
        initialCatalog.settle({ state: "error", error: activationError }, generation);
        return { ready: false, error: activationError.message };
      }
    })();

    void bridgeActivation.then(
      (outcome) => {
        bridgeActivation = null;
        if (!outcome.ready) {
          activeSessionFingerprint = null;
        }
      },
      () => {
        bridgeActivation = null;
        activeSessionFingerprint = null;
      },
    );
    return bridgeActivation;
  };

  localHttpMcp = new LocalHttpMcp(
    localRegistry,
    {
      host,
      port,
      path,
      mode,
      initialCatalog,
      identity: {
        pid: process.pid,
        mode: isDaemonMode ? "daemon" : "foreground",
        generation: gatewayGeneration,
      },
      activateRemote,
    },
    traffic,
  );

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

  if (isDaemonMode && !loadAuthSession(remote)) {
    warn("No saved remote session found. Running gateway in local-only mode.");
    initialCatalog.settle({ state: "local-only" }, 0);
  }

  // Claim the local gateway before starting any remote bridge work.
  const localStartTime = performance.now();
  const localTask = (async () => {
    await localRegistry.start();
    const url = await localHttpMcp.start();
    const health = localHttpMcp.getHealth();
    writeGatewayProcess({
      pid: health.pid,
      port: health.port,
      startedAt: Date.now(),
      mode: health.mode,
      generation: health.generation,
    });
    return url;
  })();

  // 1. Render Local Servers UI
  const startSpin = spinner();
  const configuredServerCount = Object.values(localConfig).filter((config) => !config.disabled).length;
  const configuredLabel = configuredServerCount === 1 ? "MCP server" : "MCP servers";
  const configSource = localConfigPath ? fileLink("mcp.json", localConfigPath) : "mcp.json";
  startSpin.start(
    configuredServerCount === 0
      ? `Checking ${configSource}...`
      : `Connecting to ${pc.bold(String(configuredServerCount))} ${configuredLabel} from ${configSource}...`,
  );
  let localUrl: string;
  try {
    localUrl = await localTask;
  } catch (cause) {
    initialCatalog.settle({
      state: "error",
      error: cause instanceof Error ? cause : new Error(String(cause)),
    }, 0);
    error(`Could not start local endpoint on ${host}:${port}${path}: ${(cause as Error).message}`);
    watcher?.stop();
    await Promise.allSettled([
      localHttpMcp?.close(),
      localRegistry.close(),
    ]);
    clearGatewayProcess(process.pid, gatewayGeneration);
    throw cause;
  }

  const localDuration = ((performance.now() - localStartTime) / 1000).toFixed(2);
  const localServers = localRegistry.getLocalCatalog().servers;
  const startupSummary = configuredServerCount === 0
    ? `No MCP servers configured in ${configSource}`
    : `${pc.bold(String(localServers.length))} of ${pc.bold(String(configuredServerCount))} ${configuredLabel} ready ${pc.dim(`in ${localDuration}s`)}`;
  treeSpacer();
  startSpin.stop(startupSummary);

  if (localServers.length > 0) {
    const timings = localRegistry.getLocalServerTimings();
    renderServerList(localServers, 5, timings);
  }
  for (const [serverName, message] of localRegistry.getLocalServerStartupErrors()) {
    if (message === "auth required") {
      treeNote(`${pc.dim("-")} ${pc.yellow("⚠")} ${pc.bold(serverName)}  ${pc.dim("(auth required)")}`);
    }
  }

  let shouldConnectRemote = Boolean(loadAuthSession(remote));
  if (!shouldConnectRemote && !isDaemonMode) {
    shouldConnectRemote = await confirmSignIn();
    if (!shouldConnectRemote) {
      initialCatalog.settle({ state: "local-only" }, 0);
    }
  }

  const runRemoteTask = async () => {
    const outcome = await activateRemote();
    return {
      ready: outcome.ready,
      error: outcome.error ? new Error(outcome.error) : null,
    };
  };

  // 2. Render Remote Bridge UI (started only after local ownership was claimed)
  const session = loadAuthSession(remote);
  const userInfo = extractUserInfo(session);
  let userEmail = userInfo?.email;
  let bridgeStatus = pc.dim("disabled");

  if (shouldConnectRemote) {
    const remoteStartTime = performance.now();
    let loginError: Error | null = null;
    if (!session) {
      try {
        await loginToRemote(remote);
      } catch (cause) {
        loginError = cause instanceof Error ? cause : new Error(String(cause));
        initialCatalog.settle({ state: "local-only" }, 0);
      }
    }
    const refreshedSession = loadAuthSession(remote);
    const refreshedUserInfo = extractUserInfo(refreshedSession);
    userEmail = refreshedUserInfo?.email ?? userEmail;
    const userSuffix = userEmail ? ` as ${pc.bold(userEmail)}` : "";

    if (loginError) {
      warn(`Remote sign-in failed: ${loginError.message}`);
      bridgeStatus = `${pc.cyan(remote)} ${pc.dim("(unavailable)")}`;
    } else {
      const bridgeSpin = spinner();
      bridgeSpin.start("Connecting to upstream...");
      const remoteOutcome = await runRemoteTask();
      const remoteDuration = ((performance.now() - remoteStartTime) / 1000).toFixed(2);
      const remoteServers = localRegistry.getRemoteCatalog().servers;
      if (remoteOutcome.ready) {
        bridgeSpin.stop("🤝 Connection established with upstream gateway!");
        bridgeStatus = pc.cyan(remote);
        if (remoteServers.length > 0) {
          success(`Found ${pc.bold(String(remoteServers.length))} remote server(s) ${pc.dim(`in ${remoteDuration}s`)}`);
          renderServerList(remoteServers, 5);
        }
      } else {
        bridgeSpin.stop(`Remote gateway unavailable${userSuffix}`);
        warn(`Remote catalog initialization failed: ${remoteOutcome.error?.message ?? "unknown error"}`);
        bridgeStatus = `${pc.cyan(remote)} ${pc.dim("(unavailable)")}`;
      }
    }
  } else if (isDaemonMode) {
    warn("No remote session available. Local endpoint only.");
  }

  const remoteCount = localRegistry.getRemoteCatalog().servers.length;
  const totalTools = localRegistry.aggregatedTools().length;

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
