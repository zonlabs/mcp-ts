import WebSocket from "ws";
import {
  BRIDGE_CLOSE_CODES,
  BRIDGE_METHODS,
  BRIDGE_PROTOCOL_VERSION,
  JSON_RPC_ERROR_CODES,
  BridgeProtocolError,
  bridgeInitializeResultSchema,
  createErrorResponse,
  createNotification,
  createRequest,
  createSuccessResponse,
  parseBridgeMessage,
  type CatalogSnapshot,
  type JsonRpcId,
  type ToolCallParams,
} from "@mcp-ts/bridge-protocol";
import { serverLog } from "../ux.js";
import {
  CLI_VERSION,
  DEFAULT_BRIDGE_RECONNECT_INITIAL_DELAY_MS,
  DEFAULT_BRIDGE_REQUEST_TIMEOUT_MS,
} from "../constants.js";

export interface BridgeSocket {
  readonly readyState: number;
  on(event: "open", listener: () => void): this;
  on(event: "message", listener: (data: unknown) => void): this;
  on(event: "close", listener: (code: number, reason: Buffer) => void): this;
  on(event: "error", listener: (error: Error) => void): this;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

export type BridgeSocketFactory = (
  url: string,
  options: { headers: Record<string, string> },
) => BridgeSocket;

export interface BridgeGatewayRegistry {
  getLocalCatalog(): CatalogSnapshot;
  replaceRemoteCatalog(
    catalog: CatalogSnapshot,
    invoke: (params: ToolCallParams) => Promise<unknown>,
  ): Promise<void>;
  callLocalTool(params: ToolCallParams): Promise<unknown>;
}

export interface RemoteBridgeClientOptions {
  remoteUrl: string;
  getAccessToken: () => Promise<string>;
  socketFactory?: BridgeSocketFactory;
  reconnectInitialDelayMs?: number;
  reconnectMaxDelayMs?: number;
  requestTimeoutMs?: number;
  onRemoteCatalogChanged?: (catalog: CatalogSnapshot) => void;
}

interface PendingRequest {
  resolve(value: unknown): void;
  reject(error: Error): void;
  timer: ReturnType<typeof setTimeout>;
}

const defaultSocketFactory: BridgeSocketFactory = (url, options) =>
  new WebSocket(url, { headers: options.headers }) as unknown as BridgeSocket;

export class RemoteBridgeClient {
  private socket: BridgeSocket | null = null;
  private closed = true;
  private reconnectDelay: number;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly pending = new Map<JsonRpcId, PendingRequest>();
  private readyResolver: (() => void) | null = null;
  private readyPromise!: Promise<void>;

  constructor(
    private readonly registry: BridgeGatewayRegistry,
    private readonly options: RemoteBridgeClientOptions,
  ) {
    this.reconnectDelay = options.reconnectInitialDelayMs ?? 1_000;
    this.resetReadyPromise();
  }

  private resetReadyPromise(): void {
    this.readyPromise = new Promise((resolve) => {
      this.readyResolver = resolve;
    });
  }

  async start(): Promise<void> {
    if (!this.closed) return;
    this.closed = false;
    await this.connect();
  }

  async waitForReady(timeoutMs = 3_000): Promise<boolean> {
    const timeout = new Promise<boolean>((resolve) => setTimeout(() => resolve(false), timeoutMs));
    const ready = this.readyPromise.then(() => true);
    return Promise.race([ready, timeout]);
  }

  private socketUrl(): string {
    const url = new URL(this.options.remoteUrl);
    url.protocol = url.protocol === "http:" ? "ws:" : "wss:";
    url.pathname = "/bridge/connect";
    url.search = "";
    return url.toString();
  }

  private async connect(): Promise<void> {
    if (this.closed) return;
    try {
      const accessToken = await this.options.getAccessToken();
      const socket = (this.options.socketFactory ?? defaultSocketFactory)(this.socketUrl(), {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      this.socket = socket;
      socket.on("open", () => {
        if (this.socket !== socket || this.closed) return;
        this.reconnectDelay = this.options.reconnectInitialDelayMs ?? 1_000;
        void this.initialize().catch((error) => {
          serverLog("bridge", `initialization failed: ${error.message}`);
          socket.close(BRIDGE_CLOSE_CODES.incompatibleProtocol, "initialization failed");
        });
      });
      socket.on("message", (data) => {
        if (this.socket !== socket || this.closed) return;
        void this.handleMessage(socket, data).catch((error) =>
          serverLog("bridge", `message handling failed: ${error.message}`),
        );
      });
      socket.on("close", (code) => this.handleClose(socket, code));
      socket.on("error", (error) => serverLog("bridge", `websocket error: ${error.message}`));
    } catch (error) {
      serverLog("bridge", `connection failed: ${(error as Error).message}`);
      this.scheduleReconnect();
    }
  }

  private async initialize(): Promise<void> {
    const result = await this.sendRequest(BRIDGE_METHODS.initialize, {
      protocolVersion: BRIDGE_PROTOCOL_VERSION,
      clientInfo: { name: "@mcp-ts/cli", version: CLI_VERSION },
      localCatalog: this.registry.getLocalCatalog(),
    });
    const initialized = bridgeInitializeResultSchema.parse(result);
    await this.registry.replaceRemoteCatalog(initialized.remoteCatalog, (params) =>
      this.callRemoteTool(params),
    );
    if (initialized.remoteCatalog.servers.length > 0) {
      this.readyResolver?.();
    }
  }

  async publishLocalCatalog(): Promise<void> {
    this.sendNotification(
      createNotification(BRIDGE_METHODS.localCatalogChanged, this.registry.getLocalCatalog()),
    );
  }

  private callRemoteTool(params: ToolCallParams): Promise<unknown> {
    return this.sendRequest(BRIDGE_METHODS.callTool, params);
  }

  private sendRequest(method: typeof BRIDGE_METHODS.initialize, params: Parameters<typeof createRequest>[2]): Promise<unknown>;
  private sendRequest(method: typeof BRIDGE_METHODS.callTool, params: ToolCallParams): Promise<unknown>;
  private sendRequest(method: string, params: unknown): Promise<unknown> {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("Remote bridge is offline"));
    }
    const id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Bridge request timed out: ${method}`));
        this.sendNotification(
          createNotification(BRIDGE_METHODS.cancelled, { requestId: id, reason: "timeout" }),
        );
      }, this.options.requestTimeoutMs ?? 25_000);
      this.pending.set(id, { resolve, reject, timer });
      try {
        socket.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error as Error);
      }
    });
  }

  private sendNotification(notification: unknown): void {
    const socket = this.socket;
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(notification));
  }

  private async handleMessage(socket: BridgeSocket, data: unknown): Promise<void> {
    const text = Buffer.isBuffer(data) ? data.toString("utf8") : String(data);
    let message;
    try {
      message = parseBridgeMessage(text);
    } catch (error) {
      const protocolError = error as BridgeProtocolError;
      socket.send(JSON.stringify(createErrorResponse(null, protocolError.code, protocolError.message)));
      return;
    }

    if ("result" in message || "error" in message) {
      const pending = this.pending.get(message.id as JsonRpcId);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(message.id as JsonRpcId);
      if ("error" in message) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
      return;
    }

    if (message.method === BRIDGE_METHODS.remoteCatalogChanged) {
      await this.registry.replaceRemoteCatalog(message.params, (params) => this.callRemoteTool(params));
      this.options.onRemoteCatalogChanged?.(message.params);
      if (message.params.servers.length > 0) {
        this.readyResolver?.();
      }
      return;
    }
    if (message.method === BRIDGE_METHODS.cancelled) {
      const pending = this.pending.get(message.params.requestId);
      if (pending) {
        clearTimeout(pending.timer);
        this.pending.delete(message.params.requestId);
        pending.reject(new Error(message.params.reason ?? "Bridge request cancelled"));
      }
      return;
    }
    if (message.method !== BRIDGE_METHODS.callTool) return;

    try {
      const result = await this.registry.callLocalTool(message.params);
      socket.send(JSON.stringify(createSuccessResponse(message.id, result)));
    } catch (error) {
      const code = error instanceof BridgeProtocolError
        ? error.code
        : JSON_RPC_ERROR_CODES.internalError;
      socket.send(
        JSON.stringify(
          createErrorResponse(
            message.id,
            code,
            error instanceof Error ? error.message : "Local tool call failed",
          ),
        ),
      );
    }
  }

  private handleClose(socket: BridgeSocket, code: number): void {
    if (this.socket !== socket) return;
    this.socket = null;
    this.resetReadyPromise();
    this.rejectPending(new Error("Bridge connection closed"));
    void this.registry.replaceRemoteCatalog({ servers: [] }, (params) => this.callRemoteTool(params));
    if (
      code === BRIDGE_CLOSE_CODES.replaced ||
      code === BRIDGE_CLOSE_CODES.incompatibleProtocol ||
      code === BRIDGE_CLOSE_CODES.loggedOut
    ) {
      this.closed = true;
      return;
    }
    if (!this.closed) this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.closed || this.reconnectTimer) return;
    const delay = this.reconnectDelay;
    this.reconnectDelay = Math.min(delay * 2, this.options.reconnectMaxDelayMs ?? 20_000);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, delay);
    this.reconnectTimer.unref?.();
  }

  private rejectPending(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }

  async stop(): Promise<void> {
    this.closed = true;
    this.resetReadyPromise();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.rejectPending(new Error("Bridge stopped"));
    const socket = this.socket;
    this.socket = null;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.close(BRIDGE_CLOSE_CODES.normal, "shutdown");
    }
  }
}
