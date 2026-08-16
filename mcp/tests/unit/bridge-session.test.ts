import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  BRIDGE_CLOSE_CODES,
  BRIDGE_METHODS,
  BRIDGE_PROTOCOL_VERSION,
  createRequest,
} from "@mcp-ts/bridge-protocol";

const remote = vi.hoisted(() => ({
  buildRemoteCatalog: vi.fn(async () => ({ servers: [] })),
  callRemoteTool: vi.fn(async () => ({ content: [{ type: "text", text: "ok" }] })),
}));
vi.mock("../../src/core/remote-bridge-tools", () => remote);

import {
  BridgeSession,
  replaceActiveBridgeSocket,
} from "../../src/durable-objects/bridge-session";

beforeAll(() => {
  vi.stubGlobal("WebSocket", { OPEN: 1 });
});

function socket() {
  return {
    close: vi.fn(),
    serializeAttachment: vi.fn(),
  } as unknown as WebSocket;
}

function runtime(initialAttachment = { userId: "user-123", initialized: false }) {
  let attachment = initialAttachment;
  const values = new Map<string, unknown>();
  const bridgeSocket = {
    readyState: 1,
    send: vi.fn(),
    close: vi.fn(),
    deserializeAttachment: vi.fn(() => attachment),
    serializeAttachment: vi.fn((value) => {
      attachment = value;
    }),
  } as unknown as WebSocket;
  const ctx = {
    getWebSockets: vi.fn(() => [bridgeSocket]),
    acceptWebSocket: vi.fn(),
    storage: {
      get: vi.fn(async (key: string) => values.get(key)),
      put: vi.fn(async (key: string, value: unknown) => {
        values.set(key, value);
      }),
    },
  } as unknown as DurableObjectState;
  return { bridgeSocket, ctx, session: new BridgeSession(ctx, {} as never) };
}

describe("BridgeSession socket ownership", () => {
  it("replaces the previous gateway and stores trusted session metadata", () => {
    const previous = socket();
    const current = socket();
    const ctx = {
      getWebSockets: vi.fn(() => [previous]),
      acceptWebSocket: vi.fn(),
    } as unknown as DurableObjectState;

    replaceActiveBridgeSocket(ctx, current, "user-123");

    expect(previous.close).toHaveBeenCalledWith(BRIDGE_CLOSE_CODES.replaced, "replaced");
    expect(current.serializeAttachment).toHaveBeenCalledWith({
      userId: "user-123",
      initialized: false,
    });
    expect(ctx.acceptWebSocket).toHaveBeenCalledWith(current, ["active"]);
  });

  it("persists initialization and returns the complete remote catalog", async () => {
    remote.buildRemoteCatalog.mockResolvedValueOnce({
      servers: [{ serverId: "remote:mail", serverName: "Mail", tools: [] }],
    });
    const { bridgeSocket, ctx, session } = runtime();
    const localCatalog = {
      servers: [{ serverId: "local:files", serverName: "Files", tools: [] }],
    };

    await session.webSocketMessage(
      bridgeSocket,
      JSON.stringify(
        createRequest(1, BRIDGE_METHODS.initialize, {
          protocolVersion: BRIDGE_PROTOCOL_VERSION,
          clientInfo: { name: "mcpa", version: "1.0.0" },
          localCatalog,
        }),
      ),
    );

    expect(ctx.storage.put).toHaveBeenCalledWith("localCatalog", localCatalog);
    const response = JSON.parse(vi.mocked(bridgeSocket.send).mock.calls[0][0] as string);
    expect(response.result.remoteCatalog.servers[0].serverId).toBe("remote:mail");
    expect(bridgeSocket.serializeAttachment).toHaveBeenCalledWith({
      userId: "user-123",
      initialized: true,
    });
  });

  it("dispatches remote tool calls only after initialization", async () => {
    const { bridgeSocket, session } = runtime({ userId: "user-123", initialized: true });
    const request = createRequest(7, BRIDGE_METHODS.callTool, {
      serverId: "remote:mail",
      toolName: "send",
      arguments: { subject: "Hello" },
    });
    await session.webSocketMessage(bridgeSocket, JSON.stringify(request));

    expect(remote.callRemoteTool).toHaveBeenCalledWith("user-123", request.params);
    const response = JSON.parse(vi.mocked(bridgeSocket.send).mock.calls[0][0] as string);
    expect(response.id).toBe(7);
    expect(response.result.content[0].text).toBe("ok");
  });

  it("rejects pending local calls as soon as the socket closes", async () => {
    const { bridgeSocket, session } = runtime({ userId: "user-123", initialized: true });
    const pending = session.invokeLocal({
      serverId: "local:files",
      toolName: "read",
      arguments: {},
    });
    session.webSocketClose(bridgeSocket);
    await expect(pending).rejects.toThrow("Bridge closed");
  });

  it("ignores a late close event from a replaced socket", async () => {
    const { bridgeSocket, session } = runtime({ userId: "user-123", initialized: true });
    const staleSocket = socket();
    const pending = session.invokeLocal({
      serverId: "local:files",
      toolName: "read",
      arguments: {},
    });
    const outbound = JSON.parse(vi.mocked(bridgeSocket.send).mock.calls[0][0] as string);

    session.webSocketClose(staleSocket);
    await session.webSocketMessage(
      bridgeSocket,
      JSON.stringify({ jsonrpc: "2.0", id: outbound.id, result: { content: [] } }),
    );
    await expect(pending).resolves.toEqual({ content: [] });
  });

  it("publishes empty remote snapshots so stale catalogs are cleared", async () => {
    const { bridgeSocket, session } = runtime({ userId: "user-123", initialized: true });
    await session.publishRemoteCatalog({ servers: [] });
    expect(JSON.parse(vi.mocked(bridgeSocket.send).mock.calls[0][0] as string)).toEqual({
      jsonrpc: "2.0",
      method: BRIDGE_METHODS.remoteCatalogChanged,
      params: { servers: [] },
    });
  });
});
