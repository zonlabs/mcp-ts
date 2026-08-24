import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CatalogSnapshot } from "@mcp-ts/bridge-protocol";
import { cmdServe, describeRemoteCatalogChanges } from "../src/commands/serve.js";

const serveMocks = vi.hoisted(() => ({
  bridgePublish: vi.fn(async () => undefined),
  bridgeStart: vi.fn(async () => undefined),
  bridgeStop: vi.fn(async () => undefined),
  bridgeWaitForReady: vi.fn(async () => true),
  clearGatewayProcess: vi.fn(),
  loadAuthSession: vi.fn(() => null as unknown),
  localClose: vi.fn(async () => undefined),
  localStart: vi.fn(async () => "http://127.0.0.1:9123/mcp"),
  registryClose: vi.fn(async () => undefined),
  registryStart: vi.fn(async () => undefined),
  writeGatewayProcess: vi.fn(),
}));

vi.mock("../src/gateway/daemon.js", () => ({
  clearGatewayProcess: serveMocks.clearGatewayProcess,
  spawnDaemon: vi.fn(),
  writeGatewayProcess: serveMocks.writeGatewayProcess,
}));

vi.mock("../src/gateway/registry.js", () => ({
  McpGatewayRegistry: class {
    start = serveMocks.registryStart;
    close = serveMocks.registryClose;
    reload = vi.fn(async () => undefined);
    publishLocalCatalog = vi.fn(async () => undefined);
    getLocalCatalog = () => ({ servers: [] });
    getRemoteCatalog = () => ({ servers: [] });
    getLocalServerTimings = () => new Map();
    aggregatedTools = () => [];
  },
}));

vi.mock("../src/gateway/local-http-mcp.js", () => ({
  LocalHttpMcp: class {
    start = serveMocks.localStart;
    close = serveMocks.localClose;
  },
}));

vi.mock("../src/gateway/bridge-client.js", () => ({
  RemoteBridgeClient: class {
    publishLocalCatalog = serveMocks.bridgePublish;
    start = serveMocks.bridgeStart;
    stop = serveMocks.bridgeStop;
    waitForReady = serveMocks.bridgeWaitForReady;
  },
}));

vi.mock("../src/gateway/config.js", () => ({
  loadMcpJson: vi.fn(() => {
    throw new Error("no local config");
  }),
}));

vi.mock("../src/gateway/auth-store.js", () => ({
  InvalidAuthSessionError: class extends Error {},
  ensureFreshAuthSession: vi.fn(),
  extractUserInfo: vi.fn(() => undefined),
  loadAuthSession: serveMocks.loadAuthSession,
}));

vi.mock("../src/gateway/oauth.js", () => ({ loginToRemote: vi.fn() }));

vi.mock("../src/gateway/watcher.js", () => ({
  McpConfigWatcher: class {
    start = vi.fn();
    stop = vi.fn();
  },
}));

vi.mock("../src/ux.js", () => {
  const noop = vi.fn();
  return {
    clearTicker: noop,
    dim: (value: string) => value,
    error: noop,
    info: noop,
    intro: noop,
    outro: noop,
    printBanner: noop,
    serverLog: noop,
    spinner: () => ({ start: noop, stop: noop }),
    success: noop,
    ticker: noop,
    treeNote: noop,
    treeSummary: noop,
    warn: noop,
  };
});

const originalDaemonMode = process.env.MCPA_DAEMON;
let originalExitListeners: Function[];
let originalSigintListeners: Function[];
let originalSigtermListeners: Function[];

beforeEach(() => {
  serveMocks.loadAuthSession.mockReturnValue(null);
  serveMocks.bridgeStart.mockResolvedValue(undefined);
  serveMocks.bridgeStop.mockResolvedValue(undefined);
  serveMocks.bridgeWaitForReady.mockResolvedValue(true);
  originalExitListeners = process.listeners("exit");
  originalSigintListeners = process.listeners("SIGINT");
  originalSigtermListeners = process.listeners("SIGTERM");
});

afterEach(() => {
  for (const listener of process.listeners("exit")) {
    if (!originalExitListeners.includes(listener)) process.removeListener("exit", listener);
  }
  for (const listener of process.listeners("SIGINT")) {
    if (!originalSigintListeners.includes(listener)) process.removeListener("SIGINT", listener);
  }
  for (const listener of process.listeners("SIGTERM")) {
    if (!originalSigtermListeners.includes(listener)) process.removeListener("SIGTERM", listener);
  }
  if (originalDaemonMode === undefined) delete process.env.MCPA_DAEMON;
  else process.env.MCPA_DAEMON = originalDaemonMode;
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

function catalog(
  servers: Array<{ serverId: string; serverName: string; toolCount: number }>,
): CatalogSnapshot {
  return {
    servers: servers.map(({ serverId, serverName, toolCount }) => ({
      serverId,
      serverName,
      tools: Array.from({ length: toolCount }, (_, index) => ({
        name: `tool_${index + 1}`,
        inputSchema: { type: "object" },
      })),
    })),
  };
}

describe("verbose remote catalog logging", () => {
  it("reports named remote servers added and removed", () => {
    const previous = catalog([
      { serverId: "github", serverName: "Github - Personal", toolCount: 44 },
      { serverId: "chess", serverName: "Chess", toolCount: 3 },
    ]);
    const next = catalog([
      { serverId: "github", serverName: "Github - Personal", toolCount: 44 },
      { serverId: "stitch", serverName: "Stitch", toolCount: 15 },
    ]);

    expect(describeRemoteCatalogChanges(previous, next)).toEqual([
      "Remote server connected: Stitch (15 tools)",
      "Remote server disconnected: Chess (3 tools removed)",
    ]);
  });

  it("does not report unchanged servers", () => {
    const snapshot = catalog([
      { serverId: "github", serverName: "Github - Personal", toolCount: 44 },
    ]);

    expect(describeRemoteCatalogChanges(snapshot, snapshot)).toEqual([]);
  });
});

describe("gateway process ownership from serve", () => {
  it.each([
    { daemonEnv: undefined, mode: "foreground" as const },
    { daemonEnv: "1", mode: "daemon" as const },
  ])("registers and clears a $mode process record", async ({ daemonEnv, mode }) => {
    if (daemonEnv === undefined) delete process.env.MCPA_DAEMON;
    else process.env.MCPA_DAEMON = daemonEnv;
    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);

    const serving = cmdServe({ port: 9123 });
    await vi.waitFor(() => {
      expect(serveMocks.localStart).toHaveBeenCalledOnce();
    });
    expect(serveMocks.writeGatewayProcess).toHaveBeenCalledWith({
      pid: process.pid,
      port: 9123,
      startedAt: expect.any(Number),
      mode,
    });

    process.emit("SIGTERM", "SIGTERM");
    await serving;

    expect(serveMocks.localClose).toHaveBeenCalledOnce();
    expect(serveMocks.clearGatewayProcess).toHaveBeenCalledWith(process.pid);
    expect(serveMocks.localClose.mock.invocationCallOrder[0]).toBeLessThan(
      serveMocks.clearGatewayProcess.mock.invocationCallOrder[0],
    );
    expect(exit).toHaveBeenCalledWith(0);
  });

  it("closes initialized resources when the process-record claim is refused", async () => {
    serveMocks.writeGatewayProcess.mockImplementationOnce(() => {
      throw new Error("Gateway process record is owned by live PID 4321.");
    });

    await expect(cmdServe({ port: 9123 })).rejects.toThrow("owned by live PID 4321");

    expect(serveMocks.localClose).toHaveBeenCalledOnce();
    expect(serveMocks.registryClose).toHaveBeenCalledOnce();
    expect(serveMocks.clearGatewayProcess).toHaveBeenCalledWith(process.pid);
    expect(serveMocks.localClose.mock.invocationCallOrder[0]).toBeLessThan(
      serveMocks.clearGatewayProcess.mock.invocationCallOrder[0],
    );
  });

  it("does not start a pending remote bridge before the process claim succeeds", async () => {
    serveMocks.loadAuthSession.mockReturnValue({
      accessToken: "token",
      refreshToken: "refresh",
      accessTokenExpiresAt: Date.now() + 60_000,
    });
    serveMocks.bridgeStart.mockImplementation(() => new Promise<never>(() => undefined));
    serveMocks.writeGatewayProcess.mockImplementationOnce(() => {
      throw new Error("Gateway process record is owned by live PID 4321.");
    });

    await expect(cmdServe({ port: 9123 })).rejects.toThrow("owned by live PID 4321");

    expect(serveMocks.bridgeStart).not.toHaveBeenCalled();
    expect(serveMocks.bridgeStop).toHaveBeenCalledOnce();
    expect(serveMocks.localClose).toHaveBeenCalledOnce();
  });
});
