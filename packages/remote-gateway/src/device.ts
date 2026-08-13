import { DurableObject } from "cloudflare:workers";
import type {
  DeviceRecord,
  InvokeRequest,
  InvokeResult,
  RegisterMessage,
  ServerInfo,
} from "./shared.js";

interface InvokeCall {
  requestId: string;
  mcp_server: string;
  tool: string;
  payload: unknown;
  timeoutMs?: number;
}

interface Env {
  OAUTH_KV: KVNamespace;
  USERS: KVNamespace;
  DEVICE_CONNECTION: DurableObjectNamespace<DeviceConnection>;
}

const DEVICE_TIMEOUT_MS = 25_000;

/**
 * Holds the live WebSocket to one device's local gateway. Exposes an `invoke`
 * RPC that relays a JSON-RPC tool call to the local gateway and awaits the
 * result via a pending-request map.
 */
export class DeviceConnection extends DurableObject<Env> {
  private ws: WebSocket | null = null;
  private deviceId = "";
  private servers: ServerInfo[] = [];
  private pending = new Map<
    string,
    (result: Record<string, unknown>) => void
  >();

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const upgrade = request.headers.get("Upgrade")?.toLowerCase();
    if (upgrade === "websocket") {
      const deviceId = url.searchParams.get("deviceId") ?? "";
      if (!deviceId) return new Response("missing deviceId", { status: 400 });
      this.deviceId = deviceId;
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.ws = server;
      server.accept();
      server.addEventListener("message", (event) => {
        this.onMessage((event as MessageEvent).data as string).catch((err) =>
          console.error(`[device:${deviceId}] message error: ${(err as Error).message}`),
        );
      });
      server.addEventListener("close", () => {
        this.ws = null;
      });
      server.addEventListener("error", () => {
        this.ws = null;
      });
      return new Response(null, { status: 101, webSocket: client });
    }
    return new Response("DeviceConnection", { status: 200 });
  }

  /** RPC: relay a tool call to the connected local gateway and await result. */
  async invoke(call: InvokeCall): Promise<Record<string, unknown>> {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      throw new Error("Device is offline");
    }
    const { requestId, mcp_server, tool, payload } = call;
    const timeoutMs = call.timeoutMs ?? DEVICE_TIMEOUT_MS;
    return new Promise<Record<string, unknown>>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`Device request timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      this.pending.set(requestId, (result) => {
        clearTimeout(timer);
        resolve(result);
      });
      const msg: InvokeRequest = {
        type: "invoke",
        requestId,
        mcp_server,
        tool,
        payload,
      };
      try {
        ws.send(JSON.stringify(msg));
      } catch (err) {
        clearTimeout(timer);
        this.pending.delete(requestId);
        reject(err as Error);
      }
    });
  }

  /** RPC: current registered server catalog. */
  getServers(): ServerInfo[] {
    return this.servers;
  }

  private async onMessage(data: string): Promise<void> {
    let msg: unknown;
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }
    if ((msg as { type?: string }).type === "register") {
      const reg = msg as RegisterMessage;
      if (reg.deviceId) this.deviceId = reg.deviceId;
      this.servers = reg.servers ?? [];
      const record = await this.env.USERS.get<DeviceRecord>(`device:${this.deviceId}`, "json");
      if (record) {
        record.servers = this.servers;
        await this.env.USERS.put(`device:${this.deviceId}`, JSON.stringify(record));
      }
      return;
    }
    if ((msg as { type?: string }).type === "result") {
      const res = msg as InvokeResult;
      const handler = this.pending.get(res.requestId);
      if (handler) {
        this.pending.delete(res.requestId);
        handler(res.result);
      }
    }
  }
}
