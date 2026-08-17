import { DurableObject } from "cloudflare:workers";
import {
  BRIDGE_CLOSE_CODES,
  BRIDGE_METHODS,
  BRIDGE_PROTOCOL_VERSION,
  BridgeProtocolError,
  JSON_RPC_ERROR_CODES,
  createErrorResponse,
  createNotification,
  createRequest,
  createSuccessResponse,
  parseBridgeMessage,
  type CatalogSnapshot,
  type JsonRpcId,
  type ToolCallParams,
} from "@mcp-ts/bridge-protocol";
import { buildRemoteCatalog, callRemoteTool } from "../core/remote-bridge-tools";
import { runWithRequestContext } from "../core/request-context";

export interface BridgeSessionEnv {
  BRIDGE_SESSION: DurableObjectNamespace<BridgeSession>;
}

interface BridgeAttachment {
  userId: string;
  initialized: boolean;
}

interface PendingCall {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const LOCAL_CATALOG_KEY = "localCatalog";
const DEFAULT_CALL_TIMEOUT_MS = 25_000;

function activeSocket(ctx: DurableObjectState): WebSocket | undefined {
  return ctx.getWebSockets("active").find((socket) => socket.readyState === WebSocket.OPEN);
}

export function replaceActiveBridgeSocket(
  ctx: DurableObjectState,
  socket: WebSocket,
  userId: string,
): void {
  for (const previous of ctx.getWebSockets("active")) {
    previous.close(BRIDGE_CLOSE_CODES.replaced, "replaced");
  }
  socket.serializeAttachment({ userId, initialized: false } satisfies BridgeAttachment);
  ctx.acceptWebSocket(socket, ["active"]);
}

export class BridgeSession extends DurableObject<BridgeSessionEnv> {
  private readonly pending = new Map<JsonRpcId, PendingCall>();
  private nextRequestId = 1;

  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
      return new Response("WebSocket upgrade required", { status: 426 });
    }
    const userId = request.headers.get("x-mcpa-user-id") ?? "";
    if (!userId) return new Response("Missing authenticated user", { status: 401 });

    this.rejectPending(new Error("Gateway replaced"));
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    replaceActiveBridgeSocket(this.ctx, server, userId);
    return new Response(null, { status: 101, webSocket: client });
  }

  async getStatus(): Promise<{ online: boolean; localCatalog: CatalogSnapshot }> {
    return {
      online: Boolean(activeSocket(this.ctx)),
      localCatalog: (await this.ctx.storage.get<CatalogSnapshot>(LOCAL_CATALOG_KEY)) ?? {
        servers: [],
      },
    };
  }

  async invokeLocal(call: ToolCallParams, timeoutMs = DEFAULT_CALL_TIMEOUT_MS): Promise<unknown> {
    const socket = activeSocket(this.ctx);
    if (!socket) throw new BridgeProtocolError(JSON_RPC_ERROR_CODES.serverUnavailable, "Local gateway is unavailable");
    const attachment = socket.deserializeAttachment() as BridgeAttachment | null;
    if (!attachment?.initialized) {
      throw new BridgeProtocolError(JSON_RPC_ERROR_CODES.notInitialized, "Bridge is not initialized");
    }

    const id = this.nextRequestId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new BridgeProtocolError(JSON_RPC_ERROR_CODES.timeout, "Tool call timed out"));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      try {
        socket.send(JSON.stringify(createRequest(id, BRIDGE_METHODS.callTool, call)));
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error);
      }
    });
  }

  async refreshRemoteCatalog(): Promise<void> {
    const socket = activeSocket(this.ctx);
    const attachment = socket?.deserializeAttachment() as BridgeAttachment | null;
    if (!attachment?.initialized) return;
    const catalog = await runWithRequestContext(
      { userId: attachment.userId, env: this.env as any },
      async () => await buildRemoteCatalog(attachment.userId),
    );
    await this.publishRemoteCatalog(catalog);
  }

  async publishRemoteCatalog(catalog: CatalogSnapshot): Promise<void> {
    const socket = activeSocket(this.ctx);
    const attachment = socket?.deserializeAttachment() as BridgeAttachment | null;
    if (!socket || !attachment?.initialized) return;
    this.send(socket, createNotification(BRIDGE_METHODS.remoteCatalogChanged, catalog));
  }

  disconnect(code = BRIDGE_CLOSE_CODES.loggedOut, reason = "logged out"): void {
    this.rejectPending(new Error(reason));
    for (const socket of this.ctx.getWebSockets("active")) socket.close(code, reason);
  }

  async webSocketMessage(socket: WebSocket, data: string | ArrayBuffer): Promise<void> {
    const text = typeof data === "string" ? data : new TextDecoder().decode(data);
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      this.send(socket, createErrorResponse(null, JSON_RPC_ERROR_CODES.parseError, "Parse error"));
      return;
    }

    const rawMessage = raw as { id?: JsonRpcId; method?: string; params?: Record<string, unknown> };
    if (
      rawMessage.method === BRIDGE_METHODS.initialize &&
      rawMessage.params?.protocolVersion !== BRIDGE_PROTOCOL_VERSION
    ) {
      this.send(socket, createErrorResponse(rawMessage.id ?? null, JSON_RPC_ERROR_CODES.invalidParams, "Incompatible protocol"));
      socket.close(BRIDGE_CLOSE_CODES.incompatibleProtocol, "incompatible protocol");
      return;
    }

    let message;
    try {
      message = parseBridgeMessage(raw);
    } catch (error) {
      const protocolError = error instanceof BridgeProtocolError
        ? error
        : new BridgeProtocolError(JSON_RPC_ERROR_CODES.internalError, "Internal error");
      this.send(socket, createErrorResponse(rawMessage.id ?? null, protocolError.code, protocolError.message, protocolError.data));
      return;
    }

    if (!("method" in message)) {
      if (message.id === null) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(message.id);
      if ("error" in message) pending.reject(new BridgeProtocolError(message.error.code, message.error.message, message.error.data));
      else pending.resolve(message.result);
      return;
    }

    const attachment = socket.deserializeAttachment() as BridgeAttachment | null;
    if (!attachment?.userId) {
      socket.close(BRIDGE_CLOSE_CODES.loggedOut, "invalid session");
      return;
    }

    if (message.method === BRIDGE_METHODS.initialize) {
      if (this.env && typeof this.env === "object") {
        Object.assign(process.env, this.env);
      }
      void this.ctx.storage.put(LOCAL_CATALOG_KEY, message.params.localCatalog);
      socket.serializeAttachment({ ...attachment, initialized: true } satisfies BridgeAttachment);
      const remoteCatalog = await runWithRequestContext(
        { userId: attachment.userId, env: this.env as any },
        async () => await buildRemoteCatalog(attachment.userId),
      );
      this.send(socket, createSuccessResponse(message.id, {
        protocolVersion: BRIDGE_PROTOCOL_VERSION,
        serverInfo: { name: "mcp-assistant", version: "1.0.0" },
        remoteCatalog,
      }));
      return;
    }

    if (!attachment.initialized) {
      if ("id" in message) this.send(socket, createErrorResponse(message.id, JSON_RPC_ERROR_CODES.notInitialized, "Bridge is not initialized"));
      return;
    }

    if (message.method === BRIDGE_METHODS.localCatalogChanged) {
      void this.ctx.storage.put(LOCAL_CATALOG_KEY, message.params);
      return;
    }
    if (message.method === BRIDGE_METHODS.cancelled) {
      const pending = this.pending.get(message.params.requestId);
      if (pending) {
        clearTimeout(pending.timer);
        this.pending.delete(message.params.requestId);
        pending.reject(new BridgeProtocolError(JSON_RPC_ERROR_CODES.cancelled, "Tool call cancelled"));
      }
      return;
    }
    if (message.method === BRIDGE_METHODS.callTool) {
      try {
        const result = await runWithRequestContext(
          { userId: attachment.userId, env: this.env as any },
          async () => await callRemoteTool(attachment.userId, message.params),
        );
        this.send(socket, createSuccessResponse(message.id, result));
      } catch (error) {
        const text = error instanceof Error ? error.message : "Remote tool call failed";
        const code = error instanceof BridgeProtocolError
          ? error.code
          : JSON_RPC_ERROR_CODES.internalError;
        this.send(socket, createErrorResponse(message.id, code, text));
      }
    }
  }

  webSocketClose(socket: WebSocket): void {
    const active = activeSocket(this.ctx);
    if (active && active !== socket) return;
    this.rejectPending(new Error("Bridge closed"));
  }

  webSocketError(socket: WebSocket): void {
    const active = activeSocket(this.ctx);
    if (active && active !== socket) return;
    this.rejectPending(new Error("Bridge socket failed"));
  }

  private send(socket: WebSocket, message: unknown): void {
    try {
      socket.send(JSON.stringify(message));
    } catch (error) {
      this.rejectPending(error instanceof Error ? error : new Error("Bridge send failed"));
      throw error;
    }
  }

  private rejectPending(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }
}
