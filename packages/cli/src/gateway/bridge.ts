import type { ServerManager } from "./server-manager.js";
import type { InvokeRequest, InvokeResult, RegisterMessage } from "./types.js";
import type { Traffic } from "../traffic.js";
import { serverLog } from "../ux.js";

export interface BridgeOptions {
  remoteUrl: string;
  deviceId: string;
  token: string;
  reconnectInitialDelayMs?: number;
  reconnectMaxDelayMs?: number;
  traffic?: Traffic;
}

interface Logger {
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
}

const defaultLogger: Logger = {
  info: (m) => serverLog("bridge", m),
  warn: (m) => serverLog("bridge", m),
  error: (m) => serverLog("bridge", m),
};

/**
 * Outbound WebSocket bridge: keeps a persistent connection to the remote
 * gateway, registers the local servers, and services invoke requests by
 * dispatching them to the local ServerManager.
 */
export class RemoteBridge {
  private ws: WebSocket | null = null;
  private closed = false;
  private reconnectDelay: number;
  private readonly log: Logger;

  constructor(
    private manager: ServerManager,
    private options: BridgeOptions,
    log: Logger = defaultLogger,
  ) {
    this.log = log;
    this.reconnectDelay = options.reconnectInitialDelayMs ?? 1000;
  }

  private wsUrl(): string {
    const url = new URL(this.options.remoteUrl);
    if (url.protocol === "http:") url.protocol = "ws:";
    if (url.protocol === "https:") url.protocol = "wss:";
    url.pathname = "/connect";
    url.searchParams.set("deviceId", this.options.deviceId);
    url.searchParams.set("token", this.options.token);
    return url.toString();
  }

  private buildRegister(): RegisterMessage {
    return {
      type: "register",
      deviceId: this.options.deviceId,
      servers: this.manager.serverInfos(),
    };
  }

  start(): void {
    this.closed = false;
    this.connect();
  }

  private connect(): void {
    if (this.closed) return;
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.wsUrl());
    } catch (err) {
      this.log.error(`websocket creation failed: ${(err as Error).message}`);
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;

    ws.addEventListener("open", () => {
      this.reconnectDelay = this.options.reconnectInitialDelayMs ?? 1000;
      this.log.info(`connected to ${this.options.remoteUrl}`);
      ws.send(JSON.stringify(this.buildRegister()));
    });

    ws.addEventListener("message", (event) => {
      this.onMessage(event.data as string).catch((err) =>
        this.log.error(`message handling failed: ${(err as Error).message}`),
      );
    });

    ws.addEventListener("close", (event) => {
      this.ws = null;
      if (this.closed) return;
      this.log.warn(`connection closed (code ${event.code}), reconnecting…`);
      this.scheduleReconnect();
    });

    ws.addEventListener("error", (event) => {
      this.log.error(`websocket error: ${(event as ErrorEvent).message ?? "unknown"}`);
    });
  }

  private scheduleReconnect(): void {
    if (this.closed) return;
    const delay = this.reconnectDelay;
    this.reconnectDelay = Math.min(
      delay * 2,
      this.options.reconnectMaxDelayMs ?? 20000,
    );
    setTimeout(() => this.connect(), delay);
  }

  private async onMessage(data: string): Promise<void> {
    if (!this.ws) return;
    let msg: unknown;
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }
    if ((msg as { type?: string }).type !== "invoke") return;
    const invoke = msg as InvokeRequest;
    const started = Date.now();
    try {
      const result = await this.manager.callToolByServer(
        invoke.mcp_server,
        invoke.tool,
        (invoke.payload?.arguments ?? {}) as Record<string, unknown>,
      );
      this.options.traffic?.recordIncoming(
        "invoke",
        `${invoke.mcp_server}::${invoke.tool}`,
        Date.now() - started,
      );
      const out: InvokeResult = { type: "result", requestId: invoke.requestId, result };
      this.ws.send(JSON.stringify(out));
    } catch (err) {
      this.options.traffic?.recordIncoming(
        "invoke",
        `${invoke.mcp_server}::${invoke.tool}`,
        Date.now() - started,
        500,
      );
      const out: InvokeResult = {
        type: "result",
        requestId: invoke.requestId,
        result: {
          isError: true,
          content: [{ type: "text", text: (err as Error).message }],
        },
      };
      this.ws.send(JSON.stringify(out));
    }
  }

  async stop(): Promise<void> {
    this.closed = true;
    const ws = this.ws;
    this.ws = null;
    if (ws && ws.readyState === WebSocket.OPEN) ws.close(1000, "shutdown");
  }
}
