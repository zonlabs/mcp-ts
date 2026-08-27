import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CatalogSnapshot } from "@mcp-ts/bridge-protocol";
import { cmdServe, describeRemoteCatalogChanges } from "../src/commands/serve.js";
import type {
  InitialCatalogBarrier,
  LocalHttpMcpOptions,
} from "../src/gateway/local-http-mcp.js";

const serveMocks = vi.hoisted(() => ({
  bridgePublish: vi.fn(async () => undefined),
  bridgeStart: vi.fn(async () => undefined),
  bridgeStop: vi.fn(async () => undefined),
  bridgeWaitForReady: vi.fn(async () => true),
  clearGatewayProcess: vi.fn(),
  confirmSignIn: vi.fn(async () => true),
  ensureFreshAuthSession: vi.fn(),
  fileLink: vi.fn((label: string) => label),
  InvalidAuthSessionError: class extends Error {},
  loginToRemote: vi.fn(),
  loadAuthSession: vi.fn(() => null as unknown),
  loadMcpJson: vi.fn(() => ({ path: "C:/workspace/mcp.json", config: { mcpServers: {} } })),
  localClose: vi.fn(async () => undefined),
  localServerStartupErrors: new Map<string, string>(),
  localServers: [] as CatalogSnapshot["servers"],
  localOptions: [] as LocalHttpMcpOptions[],
  localStart: vi.fn(async () => "http://127.0.0.1:9123/mcp"),
  registryClose: vi.fn(async () => undefined),
  remoteServers: [] as CatalogSnapshot["servers"],
  registryStart: vi.fn(async () => undefined),
  spinnerStart: vi.fn(),
  spinnerStop: vi.fn(),
  treeNote: vi.fn(),
  treeSpacer: vi.fn(),
  treeSummary: vi.fn(),
  warn: vi.fn(),
  writeGatewayProcess: vi.fn(),
  bridgeOptions: [] as any[],
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
    getLocalCatalog = () => ({ servers: serveMocks.localServers });
    getLocalServerStartupErrors = () => new Map(serveMocks.localServerStartupErrors);
    getRemoteCatalog = () => ({ servers: serveMocks.remoteServers });
    getLocalServerTimings = () => new Map();
    aggregatedTools = () => [];
  },
}));

vi.mock("../src/gateway/local-http-mcp.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/gateway/local-http-mcp.js")>();
  return {
    ...actual,
    LocalHttpMcp: class {
      private readonly options: LocalHttpMcpOptions;
      constructor(_registry: unknown, options: LocalHttpMcpOptions) {
        this.options = options;
        serveMocks.localOptions.push(options);
      }
      start = serveMocks.localStart;
      close = serveMocks.localClose;
      getHealth = () => ({
        status: "ok" as const,
        pid: this.options.identity!.pid,
        port: Number(new URL("http://127.0.0.1:9123/mcp").port),
        mode: this.options.identity!.mode,
        generation: this.options.identity!.generation,
      });
    },
  };
});

vi.mock("../src/gateway/bridge-client.js", () => ({
  RemoteBridgeClient: class {
    private ready = true;
    constructor(_registry: unknown, options: { onTerminalClose?: (code: number) => void; onReplaced?: () => void }) {
      serveMocks.bridgeOptions.push(options);
    }
    publishLocalCatalog = serveMocks.bridgePublish;
    start = serveMocks.bridgeStart;
    stop = vi.fn(async () => {
      this.ready = false;
      await serveMocks.bridgeStop();
    });
    waitForReady = serveMocks.bridgeWaitForReady;
    isReady = () => this.ready;
  },
}));

vi.mock("../src/gateway/config.js", () => ({
  loadMcpJson: serveMocks.loadMcpJson,
}));

vi.mock("../src/gateway/auth-store.js", () => ({
  InvalidAuthSessionError: serveMocks.InvalidAuthSessionError,
  ensureFreshAuthSession: serveMocks.ensureFreshAuthSession,
  extractUserInfo: vi.fn(() => undefined),
  loadAuthSession: serveMocks.loadAuthSession,
}));

vi.mock("../src/gateway/oauth.js", () => ({ loginToRemote: serveMocks.loginToRemote }));

vi.mock("../src/gateway/sign-in-prompt.js", () => ({
  confirmSignIn: serveMocks.confirmSignIn,
}));

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
    fileLink: serveMocks.fileLink,
    info: noop,
    intro: noop,
    outro: noop,
    printBanner: noop,
    serverLog: noop,
    spinner: () => ({ start: serveMocks.spinnerStart, stop: serveMocks.spinnerStop }),
    success: noop,
    ticker: noop,
    treeNote: serveMocks.treeNote,
    treeSpacer: serveMocks.treeSpacer,
    treeSummary: serveMocks.treeSummary,
    warn: serveMocks.warn,
  };
});

const originalDaemonMode = process.env.MCPA_DAEMON;
let originalExitListeners: Function[];
let originalSigintListeners: Function[];
let originalSigtermListeners: Function[];

beforeEach(() => {
  serveMocks.localOptions.length = 0;
  serveMocks.remoteServers.length = 0;
  serveMocks.localServers.length = 0;
  serveMocks.localServerStartupErrors.clear();
  serveMocks.bridgeOptions.length = 0;
  serveMocks.loadAuthSession.mockReturnValue(null);
  serveMocks.confirmSignIn.mockReset();
  serveMocks.confirmSignIn.mockResolvedValue(true);
  serveMocks.ensureFreshAuthSession.mockReset();
  serveMocks.loginToRemote.mockReset();
  serveMocks.loadMcpJson.mockReturnValue({ path: "C:/workspace/mcp.json", config: { mcpServers: {} } });
  serveMocks.fileLink.mockClear();
  serveMocks.spinnerStart.mockClear();
  serveMocks.spinnerStop.mockClear();
  serveMocks.treeNote.mockClear();
  serveMocks.treeSpacer.mockClear();
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

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function stopServing(serving: Promise<void>): Promise<void> {
  process.emit("SIGTERM", "SIGTERM");
  await serving;
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

describe("configured MCP startup status", () => {
  it("lists auth-required servers beneath the ready server count", async () => {
    serveMocks.loadMcpJson.mockReturnValue({
      path: "C:/workspace/mcp.json",
      config: {
        mcpServers: {
          supermemory: { url: "https://supermemory.example/mcp" },
          mem0: { url: "https://mem0.example/mcp" },
          "you.com": { url: "https://you.example/mcp" },
        },
      },
    });
    serveMocks.localServers.push({
      serverId: "you.com",
      serverName: "you.com",
      tools: [{ name: "search", inputSchema: { type: "object" } }],
    });
    serveMocks.localServerStartupErrors.set("supermemory", "auth required");
    serveMocks.localServerStartupErrors.set("mem0", "auth required");
    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);

    const serving = cmdServe({ port: 9123 });
    await vi.waitFor(() => {
      expect(serveMocks.spinnerStop).toHaveBeenCalledWith(
        expect.stringMatching(/1 of 3 MCP servers ready in \d+\.\d{2}s/),
      );
    });

    expect(serveMocks.fileLink).toHaveBeenCalledWith("mcp.json", "C:/workspace/mcp.json");
    expect(serveMocks.spinnerStart).toHaveBeenCalledWith("Connecting to 3 MCP servers from mcp.json...");
    expect(serveMocks.treeSpacer).toHaveBeenCalledOnce();
    expect(serveMocks.treeNote).toHaveBeenCalledWith(expect.stringContaining("supermemory"));
    expect(serveMocks.treeNote).toHaveBeenCalledWith(expect.stringContaining("mem0"));
    expect(serveMocks.treeNote).toHaveBeenCalledWith(expect.stringContaining("auth required"));
    await stopServing(serving);
    expect(exit).toHaveBeenCalledWith(0);
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

    const serving = cmdServe({ port: 9122 });
    await vi.waitFor(() => {
      expect(serveMocks.localStart).toHaveBeenCalledOnce();
    });
    expect(serveMocks.writeGatewayProcess).toHaveBeenCalledWith({
      pid: process.pid,
      port: 9123,
      startedAt: expect.any(Number),
      mode,
      generation: expect.stringMatching(/^[0-9a-f-]{36}$/i),
    });

    process.emit("SIGTERM", "SIGTERM");
    await serving;

    expect(serveMocks.localClose).toHaveBeenCalledOnce();
    expect(serveMocks.clearGatewayProcess).toHaveBeenCalledWith(
      process.pid,
      expect.stringMatching(/^[0-9a-f-]{36}$/i),
    );
    expect(serveMocks.localClose.mock.invocationCallOrder[0]).toBeLessThan(
      serveMocks.clearGatewayProcess.mock.invocationCallOrder[0],
    );
    expect(exit).toHaveBeenCalledWith(0);
  });

  it("closes initialized resources when the process-record claim is refused", async () => {
    serveMocks.loadAuthSession.mockReturnValue({
      accessToken: "token",
      refreshToken: "refresh",
      accessTokenExpiresAt: Date.now() + 60_000,
    });
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on("unhandledRejection", onUnhandled);
    serveMocks.writeGatewayProcess.mockImplementationOnce(() => {
      throw new Error("Gateway process record is owned by live PID 4321.");
    });

    try {
      await expect(cmdServe({ port: 9123 })).rejects.toThrow("owned by live PID 4321");

      const barrier = serveMocks.localOptions[0].initialCatalog as InitialCatalogBarrier;
      await expect(barrier.wait()).resolves.toMatchObject({
        state: "error",
        error: expect.objectContaining({ message: "Gateway process record is owned by live PID 4321." }),
      });
      await new Promise((resolve) => setImmediate(resolve));
      expect(unhandled).toEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }

    expect(serveMocks.localClose).toHaveBeenCalledOnce();
    expect(serveMocks.registryClose).toHaveBeenCalledOnce();
    expect(serveMocks.clearGatewayProcess).toHaveBeenCalledWith(
      process.pid,
      expect.stringMatching(/^[0-9a-f-]{36}$/i),
    );
    expect(serveMocks.localClose.mock.invocationCallOrder[0]).toBeLessThan(
      serveMocks.clearGatewayProcess.mock.invocationCallOrder[0],
    );
  });

  it("settles the catalog barrier and cleans up when the local listener cannot start", async () => {
    serveMocks.loadAuthSession.mockReturnValue({
      accessToken: "token",
      refreshToken: "refresh",
      accessTokenExpiresAt: Date.now() + 60_000,
    });
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on("unhandledRejection", onUnhandled);
    serveMocks.localStart.mockRejectedValueOnce(new Error("listen EADDRINUSE 127.0.0.1:9123"));

    try {
      await expect(cmdServe({ port: 9123 })).rejects.toThrow("listen EADDRINUSE");

      const barrier = serveMocks.localOptions[0].initialCatalog as InitialCatalogBarrier;
      await expect(barrier.wait()).resolves.toMatchObject({
        state: "error",
        error: expect.objectContaining({ message: "listen EADDRINUSE 127.0.0.1:9123" }),
      });
      await new Promise((resolve) => setImmediate(resolve));
      expect(unhandled).toEqual([]);
      expect(serveMocks.localClose).toHaveBeenCalledOnce();
      expect(serveMocks.registryClose).toHaveBeenCalledOnce();
      expect(serveMocks.clearGatewayProcess).toHaveBeenCalledWith(
        process.pid,
        expect.stringMatching(/^[0-9a-f-]{36}$/i),
      );
      expect(serveMocks.bridgeStart).not.toHaveBeenCalled();
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
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
    expect(serveMocks.bridgeStop).not.toHaveBeenCalled();
    expect(serveMocks.localClose).toHaveBeenCalledOnce();
  });
});

describe("initial catalog readiness from serve", () => {
  it("does not start browser login when a saved remote session has expired", async () => {
    const session = {
      accessToken: "expired-token",
      refreshToken: "expired-refresh",
      accessTokenExpiresAt: Date.now() - 1,
    };
    serveMocks.loadAuthSession.mockReturnValue(session);
    serveMocks.ensureFreshAuthSession.mockRejectedValue(new serveMocks.InvalidAuthSessionError());
    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    const serving = cmdServe({ port: 9123 });
    await vi.waitFor(() => expect(serveMocks.bridgeOptions).toHaveLength(1));

    await expect(serveMocks.bridgeOptions[0].getAccessToken()).rejects.toBeInstanceOf(
      serveMocks.InvalidAuthSessionError,
    );
    expect(serveMocks.loginToRemote).not.toHaveBeenCalled();

    await stopServing(serving);
    expect(exit).toHaveBeenCalledWith(0);
  });

  it("settles local-only immediately when no saved session exists", async () => {
    process.env.MCPA_DAEMON = "1";
    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    const serving = cmdServe({ port: 9123 });
    await vi.waitFor(() => expect(serveMocks.localStart).toHaveBeenCalledOnce());

    const barrier = serveMocks.localOptions[0].initialCatalog as InitialCatalogBarrier;
    await expect(barrier.wait()).resolves.toEqual({ state: "local-only" });

    await stopServing(serving);
    expect(exit).toHaveBeenCalledWith(0);
  });

  it("signs in after foreground consent when no saved session exists", async () => {
    const signedInSession = {
      accessToken: "token-after-login",
      refreshToken: "refresh-after-login",
      accessTokenExpiresAt: Date.now() + 60_000,
    };
    serveMocks.loginToRemote.mockImplementationOnce(async () => {
      serveMocks.loadAuthSession.mockReturnValue(signedInSession);
      return { ...signedInSession, alreadySignedIn: false };
    });
    serveMocks.ensureFreshAuthSession.mockResolvedValue(signedInSession);
    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);

    const serving = cmdServe({ port: 9123 });
    await vi.waitFor(() => expect(serveMocks.bridgeStart).toHaveBeenCalledOnce());

    expect(serveMocks.confirmSignIn).toHaveBeenCalledOnce();
    expect(serveMocks.loginToRemote).toHaveBeenCalledWith("https://api.mcp-assistant.in");
    expect(serveMocks.spinnerStart).not.toHaveBeenCalledWith("Waiting for sign-in in your browser...");
    expect(serveMocks.spinnerStart).toHaveBeenCalledWith("Connecting to upstream...");
    expect(serveMocks.spinnerStop).toHaveBeenCalledWith(
      "🤝 Connection established with upstream gateway!",
    );
    const barrier = serveMocks.localOptions[0].initialCatalog as InitialCatalogBarrier;
    await expect(barrier.wait()).resolves.toEqual({ state: "ready" });

    await stopServing(serving);
    expect(exit).toHaveBeenCalledWith(0);
  });

  it("continues local-only when foreground sign-in is declined", async () => {
    serveMocks.confirmSignIn.mockResolvedValueOnce(false);
    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);

    const serving = cmdServe({ port: 9123 });
    await vi.waitFor(() => expect(serveMocks.confirmSignIn).toHaveBeenCalledOnce());

    expect(serveMocks.loginToRemote).not.toHaveBeenCalled();
    expect(serveMocks.bridgeStart).not.toHaveBeenCalled();
    const barrier = serveMocks.localOptions[0].initialCatalog as InitialCatalogBarrier;
    await expect(barrier.wait()).resolves.toEqual({ state: "local-only" });

    await stopServing(serving);
    expect(exit).toHaveBeenCalledWith(0);
  });

  it("activates one bridge after a session is saved without restarting the gateway", async () => {
    process.env.MCPA_DAEMON = "1";
    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    const serving = cmdServe({ port: 9123 });
    await vi.waitFor(() => expect(serveMocks.localStart).toHaveBeenCalledOnce());

    const options = serveMocks.localOptions[0] as LocalHttpMcpOptions & {
      activateRemote?: () => Promise<{ ready: boolean }>;
    };
    await expect(options.initialCatalog!.wait()).resolves.toEqual({ state: "local-only" });
    serveMocks.loadAuthSession.mockReturnValue({
      accessToken: "token",
      refreshToken: "refresh",
      accessTokenExpiresAt: Date.now() + 60_000,
    });

    await expect(options.activateRemote?.()).resolves.toEqual({ ready: true });
    await expect(options.activateRemote?.()).resolves.toEqual({ ready: true });
    expect(serveMocks.bridgeStart).toHaveBeenCalledOnce();
    expect(serveMocks.localStart).toHaveBeenCalledOnce();
    expect(serveMocks.writeGatewayProcess).toHaveBeenCalledOnce();

    await stopServing(serving);
    expect(exit).toHaveBeenCalledWith(0);
  });

  it("keeps meta operations pending until bridge readiness confirms registration", async () => {
    const ready = deferred<boolean>();
    serveMocks.loadAuthSession.mockReturnValue({
      accessToken: "token",
      refreshToken: "refresh",
      accessTokenExpiresAt: Date.now() + 60_000,
    });
    serveMocks.bridgeWaitForReady.mockReturnValueOnce(ready.promise);
    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    const serving = cmdServe({ port: 9123 });
    await vi.waitFor(() => expect(serveMocks.bridgeWaitForReady).toHaveBeenCalledOnce());

    const barrier = serveMocks.localOptions[0].initialCatalog as InitialCatalogBarrier;
    let outcome: unknown = "pending";
    void barrier.wait().then((value) => {
      outcome = value;
    });
    await Promise.resolve();
    expect(outcome).toBe("pending");

    ready.resolve(true);
    await vi.waitFor(() => expect(outcome).toEqual({ state: "ready" }));

    await stopServing(serving);
    expect(exit).toHaveBeenCalledWith(0);
  });

  it.each([
    { label: "false", configure: () => serveMocks.bridgeWaitForReady.mockResolvedValueOnce(false) },
    { label: "throw", configure: () => serveMocks.bridgeWaitForReady.mockRejectedValueOnce(new Error("bridge rejected")) },
  ])("settles an error outcome when remote initialization returns $label", async ({ configure }) => {
    serveMocks.loadAuthSession.mockReturnValue({
      accessToken: "token",
      refreshToken: "refresh",
      accessTokenExpiresAt: Date.now() + 60_000,
    });
    configure();
    serveMocks.remoteServers.push({
      serverId: "stale-remote",
      serverName: "Stale Remote",
      tools: [{ name: "stale_tool", inputSchema: { type: "object" } }],
    });
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on("unhandledRejection", onUnhandled);
    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);

    try {
      const serving = cmdServe({ port: 9123 });
      await vi.waitFor(() => expect(serveMocks.bridgeWaitForReady).toHaveBeenCalledOnce());
      const barrier = serveMocks.localOptions[0].initialCatalog as InitialCatalogBarrier;
      await expect(barrier.wait()).resolves.toMatchObject({
        state: "error",
        error: expect.any(Error),
      });

      await vi.waitFor(() => {
        expect(serveMocks.spinnerStop).toHaveBeenCalledWith(
          expect.stringContaining("Remote gateway unavailable"),
        );
      });
      expect(serveMocks.spinnerStop).not.toHaveBeenCalledWith(
        expect.stringContaining("Connection established with upstream gateway!"),
      );
      expect(serveMocks.treeSummary).toHaveBeenCalledWith(
        "Gateway Summary",
        expect.arrayContaining([
          expect.objectContaining({ label: "Bridge", value: expect.stringContaining("unavailable") }),
        ]),
      );

      await stopServing(serving);
      await new Promise((resolve) => setImmediate(resolve));
      expect(unhandled).toEqual([]);
      expect(exit).toHaveBeenCalledWith(0);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });

  it("reconnects with a new bridge when the saved session changes while an old bridge is ready", async () => {
    process.env.MCPA_DAEMON = "1";
    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    const serving = cmdServe({ port: 9123 });
    await vi.waitFor(() => expect(serveMocks.localStart).toHaveBeenCalledOnce());

    const options = serveMocks.localOptions[0] as LocalHttpMcpOptions & {
      activateRemote?: () => Promise<{ ready: boolean }>;
    };

    // 1. Initial activation with session A
    serveMocks.loadAuthSession.mockReturnValue({
      accessToken: "token-a",
      refreshToken: "refresh-a",
      accessTokenExpiresAt: Date.now() + 60_000,
    });
    await expect(options.activateRemote?.()).resolves.toEqual({ ready: true });
    expect(serveMocks.bridgeStart).toHaveBeenCalledTimes(1);

    // 2. Repeated activation of the same session is idempotent
    await expect(options.activateRemote?.()).resolves.toEqual({ ready: true });
    expect(serveMocks.bridgeStart).toHaveBeenCalledTimes(1);

    // 3. Saved session changes to session B -> reconnects exactly once
    serveMocks.loadAuthSession.mockReturnValue({
      accessToken: "token-b",
      refreshToken: "refresh-b",
      accessTokenExpiresAt: Date.now() + 60_000,
    });
    await expect(options.activateRemote?.()).resolves.toEqual({ ready: true });
    expect(serveMocks.bridgeStop).toHaveBeenCalledTimes(1);
    expect(serveMocks.bridgeStart).toHaveBeenCalledTimes(2);

    await stopServing(serving);
    expect(exit).toHaveBeenCalledWith(0);
  });

  it("invalidates readiness on terminal close and reconnects on subsequent login activation", async () => {
    process.env.MCPA_DAEMON = "1";
    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    const serving = cmdServe({ port: 9123 });
    await vi.waitFor(() => expect(serveMocks.localStart).toHaveBeenCalledOnce());

    const options = serveMocks.localOptions[0] as LocalHttpMcpOptions & {
      activateRemote?: () => Promise<{ ready: boolean }>;
    };

    // 1. Initial activation with session 1
    serveMocks.loadAuthSession.mockReturnValue({
      accessToken: "token-1",
      refreshToken: "refresh-1",
      accessTokenExpiresAt: Date.now() + 60_000,
    });
    await expect(options.activateRemote?.()).resolves.toEqual({ ready: true });
    expect(serveMocks.bridgeStart).toHaveBeenCalledTimes(1);

    // 2. Terminal close event (e.g. loggedOut code 4003) invalidates readiness
    const bridgeOpt = serveMocks.bridgeOptions[0];
    bridgeOpt.onTerminalClose?.(4003);

    // 3. User logs in with new credentials
    serveMocks.loadAuthSession.mockReturnValue({
      accessToken: "token-new",
      refreshToken: "refresh-new",
      accessTokenExpiresAt: Date.now() + 60_000,
    });

    // 4. Subsequent activation reconnects with new bridge
    await expect(options.activateRemote?.()).resolves.toEqual({ ready: true });
    expect(serveMocks.bridgeStart).toHaveBeenCalledTimes(2);

    await stopServing(serving);
    expect(exit).toHaveBeenCalledWith(0);
  });

  it("recovers catalog readiness upon subsequent activation after initial bridge startup failure", async () => {
    process.env.MCPA_DAEMON = "1";
    serveMocks.loadAuthSession.mockReturnValue({
      accessToken: "token-initial",
      refreshToken: "refresh-initial",
      accessTokenExpiresAt: Date.now() + 60_000,
    });
    // Initial remote startup fails
    serveMocks.bridgeWaitForReady.mockResolvedValueOnce(false);

    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    const serving = cmdServe({ port: 9123 });
    await vi.waitFor(() => expect(serveMocks.localStart).toHaveBeenCalledOnce());

    const options = serveMocks.localOptions[0] as LocalHttpMcpOptions & {
      activateRemote?: () => Promise<{ ready: boolean }>;
    };
    const barrier = options.initialCatalog as InitialCatalogBarrier;

    // Initial barrier has error
    await expect(barrier.wait()).resolves.toMatchObject({
      state: "error",
      error: expect.any(Error),
    });

    // Subsequent activation succeeds
    serveMocks.bridgeWaitForReady.mockResolvedValueOnce(true);
    serveMocks.loadAuthSession.mockReturnValue({
      accessToken: "token-recovered",
      refreshToken: "refresh-recovered",
      accessTokenExpiresAt: Date.now() + 60_000,
    });

    await expect(options.activateRemote?.()).resolves.toEqual({ ready: true });
    await expect(barrier.wait()).resolves.toEqual({ state: "ready" });

    await stopServing(serving);
    expect(exit).toHaveBeenCalledWith(0);
  });
});
