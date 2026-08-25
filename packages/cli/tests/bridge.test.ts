import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import {
  BRIDGE_CLOSE_CODES,
  BRIDGE_METHODS,
  BRIDGE_PROTOCOL_VERSION,
  createRequest,
  createSuccessResponse,
  type CatalogSnapshot,
  type ToolCallParams,
} from "@mcp-ts/bridge-protocol";
import {
  RemoteBridgeClient,
  type BridgeSocket,
  type BridgeSocketFactory,
  type RemoteBridgeClientOptions,
} from "../src/gateway/bridge-client.js";

class FakeSocket extends EventEmitter implements BridgeSocket {
  readyState = 0;
  sent: string[] = [];
  closed: { code?: number; reason?: string } | null = null;

  send(data: string): void {
    this.sent.push(data);
  }

  close(code?: number, reason?: string): void {
    this.closed = { code, reason };
    this.readyState = 3;
    this.emit("close", code ?? 1000, Buffer.from(reason ?? ""));
  }

  open(): void {
    this.readyState = 1;
    this.emit("open");
  }

  receive(message: unknown): void {
    this.emit("message", Buffer.from(JSON.stringify(message)));
  }
}

function localCatalog(): CatalogSnapshot {
  return {
    servers: [
      {
        serverId: "local-files",
        serverName: "Local Files",
        tools: [{ name: "read_file", inputSchema: { type: "object" } }],
      },
    ],
  };
}

function setup(overrides: Partial<RemoteBridgeClientOptions> = {}) {
  const socket = new FakeSocket();
  const calls: ToolCallParams[] = [];
  let remoteInvoker: ((params: ToolCallParams) => Promise<unknown>) | undefined;
  const manager = {
    getLocalCatalog: vi.fn(() => localCatalog()),
    replaceRemoteCatalog: vi.fn(
      async (_catalog: CatalogSnapshot, invoke: (params: ToolCallParams) => Promise<unknown>) => {
        remoteInvoker = invoke;
      },
    ),
    callLocalTool: vi.fn(async (params: ToolCallParams) => {
      calls.push(params);
      return { content: [{ type: "text", text: "local-result" }] };
    }),
  };
  const socketFactory: BridgeSocketFactory = vi.fn((url, options) => {
    expect(url).toBe("wss://api.mcp-assistant.in/bridge/connect");
    expect(options.headers).toEqual({ Authorization: "Bearer access-secret" });
    expect(url).not.toContain("access-secret");
    return socket;
  });
  const bridge = new RemoteBridgeClient(manager, {
    remoteUrl: "https://api.mcp-assistant.in/mcp",
    getAccessToken: async () => "access-secret",
    socketFactory,
    reconnectInitialDelayMs: 60_000,
    ...overrides,
  });
  return { bridge, calls, manager, remoteInvoker: () => remoteInvoker, socket, socketFactory };
}

describe("RemoteBridgeClient", () => {
  it("authenticates with a header and initializes with only the local catalog", async () => {
    const onRemoteCatalogChanged = vi.fn();
    const { bridge, manager, socket } = setup({ onRemoteCatalogChanged });
    await bridge.start();
    socket.open();

    const initialize = JSON.parse(socket.sent[0]);
    expect(initialize).toMatchObject({
      jsonrpc: "2.0",
      method: BRIDGE_METHODS.initialize,
      params: {
        protocolVersion: BRIDGE_PROTOCOL_VERSION,
        localCatalog: localCatalog(),
      },
    });
    const remoteCatalog: CatalogSnapshot = { servers: [] };
    socket.receive(
      createSuccessResponse(initialize.id, {
        protocolVersion: BRIDGE_PROTOCOL_VERSION,
        serverInfo: { name: "mcp-assistant", version: "1.0.0" },
        remoteCatalog,
      }),
    );
    await vi.waitFor(() => expect(manager.replaceRemoteCatalog).toHaveBeenCalledWith(remoteCatalog, expect.any(Function)));
    expect(onRemoteCatalogChanged).toHaveBeenCalledWith(remoteCatalog);
  });

  it("routes tool calls in both directions", async () => {
    const state = setup();
    await state.bridge.start();
    state.socket.open();
    const initialize = JSON.parse(state.socket.sent[0]);
    state.socket.receive(
      createSuccessResponse(initialize.id, {
        protocolVersion: BRIDGE_PROTOCOL_VERSION,
        serverInfo: { name: "mcp-assistant", version: "1.0.0" },
        remoteCatalog: { servers: [] },
      }),
    );
    await vi.waitFor(() => expect(state.remoteInvoker()).toBeTypeOf("function"));

    const remotePromise = state.remoteInvoker()!({
      serverId: "remote-github",
      toolName: "create_issue",
      arguments: { title: "Test" },
    });
    const outbound = JSON.parse(state.socket.sent.at(-1)!);
    expect(outbound.method).toBe(BRIDGE_METHODS.callTool);
    state.socket.receive(createSuccessResponse(outbound.id, { content: [] }));
    await expect(remotePromise).resolves.toEqual({ content: [] });

    state.socket.receive(
      createRequest("incoming-1", BRIDGE_METHODS.callTool, {
        serverId: "local-files",
        toolName: "read_file",
        arguments: { path: "README.md" },
      }),
    );
    await vi.waitFor(() => expect(state.calls).toHaveLength(1));
    expect(JSON.parse(state.socket.sent.at(-1)!)).toEqual(
      createSuccessResponse("incoming-1", {
        content: [{ type: "text", text: "local-result" }],
      }),
    );
  });

  it("rejects pending calls when stopped", async () => {
    const state = setup();
    await state.bridge.start();
    state.socket.open();
    const initialize = JSON.parse(state.socket.sent[0]);
    state.socket.receive(
      createSuccessResponse(initialize.id, {
        protocolVersion: BRIDGE_PROTOCOL_VERSION,
        serverInfo: { name: "mcp-assistant", version: "1.0.0" },
        remoteCatalog: { servers: [] },
      }),
    );
    await vi.waitFor(() => expect(state.remoteInvoker()).toBeTypeOf("function"));

    const pending = state.remoteInvoker()!({
      serverId: "remote-github",
      toolName: "slow_tool",
      arguments: {},
    });
    await state.bridge.stop();
    await expect(pending).rejects.toThrow("Bridge stopped");
  });

  it("does not reconnect after replacement, logout, or protocol rejection", async () => {
    vi.useFakeTimers();
    try {
      for (const code of [
        BRIDGE_CLOSE_CODES.replaced,
        BRIDGE_CLOSE_CODES.loggedOut,
        BRIDGE_CLOSE_CODES.incompatibleProtocol,
      ]) {
        const state = setup();
        await state.bridge.start();
        state.socket.open();
        state.socket.emit("close", code, Buffer.from("terminal"));
        await vi.advanceTimersByTimeAsync(120_000);
        expect(state.socketFactory).toHaveBeenCalledTimes(1);
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it("visibly reports genuine bridge replacement", async () => {
    const onReplaced = vi.fn();
    const state = setup({ onReplaced });
    await state.bridge.start();
    state.socket.open();

    state.socket.emit("close", BRIDGE_CLOSE_CODES.replaced, Buffer.from("replaced"));

    expect(onReplaced).toHaveBeenCalledOnce();
  });

  it("times out pending calls and sends best-effort cancellation", async () => {
    vi.useFakeTimers();
    try {
      const state = setup({ requestTimeoutMs: 25 });
      await state.bridge.start();
      state.socket.open();
      const initialize = JSON.parse(state.socket.sent[0]);
      state.socket.receive(
        createSuccessResponse(initialize.id, {
          protocolVersion: BRIDGE_PROTOCOL_VERSION,
          serverInfo: { name: "mcp-assistant", version: "1.0.0" },
          remoteCatalog: { servers: [] },
        }),
      );
      await vi.waitFor(() => expect(state.remoteInvoker()).toBeTypeOf("function"));
      const pending = state.remoteInvoker()!({
        serverId: "remote:mail",
        toolName: "slow",
        arguments: {},
      });
      const assertion = expect(pending).rejects.toThrow("timed out");
      await vi.advanceTimersByTimeAsync(25);
      await assertion;
      expect(JSON.parse(state.socket.sent.at(-1)!)).toMatchObject({
        method: BRIDGE_METHODS.cancelled,
        params: { reason: "timeout" },
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("resets ready state across disconnect and resolves again upon reconnect initialize", async () => {
    vi.useFakeTimers();
    try {
      const sockets: FakeSocket[] = [];
      const socketFactory: BridgeSocketFactory = vi.fn(() => {
        const s = new FakeSocket();
        sockets.push(s);
        return s;
      });
      const state = setup({ socketFactory, reconnectInitialDelayMs: 100 });
      await state.bridge.start();

      const socket1 = sockets[0];
      socket1.open();

      const init1 = JSON.parse(socket1.sent[0]);
      socket1.receive(
        createSuccessResponse(init1.id, {
          protocolVersion: BRIDGE_PROTOCOL_VERSION,
          serverInfo: { name: "mcp-assistant", version: "1.0.0" },
          remoteCatalog: { servers: [] },
        }),
      );

      // Flush initialize microtasks
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(0);

      // Should be ready
      const ready1 = await state.bridge.waitForReady(500);
      expect(ready1).toBe(true);

      // Socket disconnects with abnormal closure code 1006 (triggers reconnect)
      socket1.close(1006, "connection dropped");

      // After disconnect, waitForReady should timeout to false
      const waitDisconnected = state.bridge.waitForReady(50);
      await vi.advanceTimersByTimeAsync(50);
      expect(await waitDisconnected).toBe(false);

      // Advance timers to trigger reconnect
      await vi.advanceTimersByTimeAsync(150);
      expect(sockets.length).toBe(2);

      const socket2 = sockets[1];
      socket2.open();

      const init2 = JSON.parse(socket2.sent[0]);
      socket2.receive(
        createSuccessResponse(init2.id, {
          protocolVersion: BRIDGE_PROTOCOL_VERSION,
          serverInfo: { name: "mcp-assistant", version: "1.0.0" },
          remoteCatalog: { servers: [] },
        }),
      );

      // Flush reconnect initialize microtasks
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(0);

      // Should resolve again upon reconnect initialize
      const readyAfterReconnect = await state.bridge.waitForReady(500);
      expect(readyAfterReconnect).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps an initial waiter across a reconnectable close without restarting its deadline", async () => {
    vi.useFakeTimers();
    try {
      const sockets: FakeSocket[] = [];
      const socketFactory: BridgeSocketFactory = vi.fn(() => {
        const socket = new FakeSocket();
        sockets.push(socket);
        return socket;
      });
      const state = setup({ socketFactory, reconnectInitialDelayMs: 100 });
      await state.bridge.start();
      sockets[0].open();

      let result: boolean | "pending" = "pending";
      const readiness = state.bridge.waitForReady(500).then((ready) => {
        result = ready;
        return ready;
      });
      await vi.advanceTimersByTimeAsync(300);
      sockets[0].close(1006, "connection dropped before initialization");
      await vi.advanceTimersByTimeAsync(100);

      expect(sockets).toHaveLength(2);
      sockets[1].open();
      const initialize = JSON.parse(sockets[1].sent[0]);
      sockets[1].receive(
        createSuccessResponse(initialize.id, {
          protocolVersion: BRIDGE_PROTOCOL_VERSION,
          serverInfo: { name: "mcp-assistant", version: "1.0.0" },
          remoteCatalog: {
            servers: [
              {
                serverId: "github",
                serverName: "GitHub",
                tools: [{ name: "pull_request_read", inputSchema: { type: "object" } }],
              },
            ],
          },
        }),
      );
      await vi.advanceTimersByTimeAsync(0);

      expect(result).toBe(true);
      await expect(readiness).resolves.toBe(true);
      expect(state.manager.replaceRemoteCatalog).toHaveBeenCalledWith(
        expect.objectContaining({ servers: [expect.objectContaining({ serverId: "github" })] }),
        expect.any(Function),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not restart the readiness deadline after a reconnectable close", async () => {
    vi.useFakeTimers();
    try {
      const sockets: FakeSocket[] = [];
      const socketFactory: BridgeSocketFactory = vi.fn(() => {
        const socket = new FakeSocket();
        sockets.push(socket);
        return socket;
      });
      const state = setup({ socketFactory, reconnectInitialDelayMs: 100 });
      await state.bridge.start();
      sockets[0].open();

      const readiness = state.bridge.waitForReady(500);
      await vi.advanceTimersByTimeAsync(300);
      sockets[0].close(1006, "connection dropped before initialization");
      await vi.advanceTimersByTimeAsync(200);

      await expect(readiness).resolves.toBe(false);
      expect(sockets).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("ignores stale initialization completion from a socket that already closed", async () => {
    vi.useFakeTimers();
    try {
      const sockets: FakeSocket[] = [];
      const socketFactory: BridgeSocketFactory = vi.fn(() => {
        const socket = new FakeSocket();
        sockets.push(socket);
        return socket;
      });
      let resolveFirstReplace!: () => void;
      const firstReplace = new Promise<void>((resolve) => {
        resolveFirstReplace = resolve;
      });
      const state = setup({ socketFactory, reconnectInitialDelayMs: 100 });
      state.manager.replaceRemoteCatalog
        .mockImplementationOnce(async () => firstReplace)
        .mockResolvedValue(undefined);
      await state.bridge.start();
      sockets[0].open();
      const firstInitialize = JSON.parse(sockets[0].sent[0]);
      sockets[0].receive(
        createSuccessResponse(firstInitialize.id, {
          protocolVersion: BRIDGE_PROTOCOL_VERSION,
          serverInfo: { name: "mcp-assistant", version: "1.0.0" },
          remoteCatalog: { servers: [] },
        }),
      );
      await vi.advanceTimersByTimeAsync(0);
      expect(state.manager.replaceRemoteCatalog).toHaveBeenCalledOnce();

      let result: boolean | "pending" = "pending";
      const readiness = state.bridge.waitForReady(500).then((ready) => {
        result = ready;
        return ready;
      });
      sockets[0].close(1006, "closed during catalog registration");
      await vi.advanceTimersByTimeAsync(100);
      expect(sockets).toHaveLength(2);

      resolveFirstReplace();
      await vi.advanceTimersByTimeAsync(0);
      expect(result).toBe("pending");

      sockets[1].open();
      const secondInitialize = JSON.parse(sockets[1].sent[0]);
      sockets[1].receive(
        createSuccessResponse(secondInitialize.id, {
          protocolVersion: BRIDGE_PROTOCOL_VERSION,
          serverInfo: { name: "mcp-assistant", version: "1.0.0" },
          remoteCatalog: { servers: [] },
        }),
      );
      await vi.advanceTimersByTimeAsync(0);

      expect(result).toBe(true);
      await expect(readiness).resolves.toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("settles initial readiness immediately when initialization closes terminally", async () => {
    vi.useFakeTimers();
    try {
      const state = setup();
      await state.bridge.start();
      state.socket.open();
      let result: boolean | "pending" = "pending";
      const readiness = state.bridge.waitForReady(10_000).then((ready) => {
        result = ready;
        return ready;
      });

      state.socket.close(BRIDGE_CLOSE_CODES.incompatibleProtocol, "initialization failed");
      await vi.advanceTimersByTimeAsync(0);

      expect(result).toBe(false);
      await expect(readiness).resolves.toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("resolves waitForReady with false immediately when stopped", async () => {
    const state = setup();
    await state.bridge.start();
    const waitPromise = state.bridge.waitForReady(10_000);
    await state.bridge.stop();
    const result = await waitPromise;
    expect(result).toBe(false);
  });
});
