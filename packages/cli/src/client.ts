import {
  Client,
  StreamableHTTPClientTransport,
  type Tool
} from "@modelcontextprotocol/client";
import type { ToolClient } from "@mcp-ts/sdk/shared";

function serverIdFor(url: URL): string {
  const path = url.pathname.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "");
  return `${url.hostname}${path ? `_${path}` : ""}`.toLowerCase();
}

export class RemoteToolClient implements ToolClient {
  private readonly client = new Client({ name: "@mcp-ts/cli", version: "0.1.0" });
  private readonly transport: StreamableHTTPClientTransport;
  private connected = false;
  private cachedTools: Tool[] | undefined;
  private readonly serverId: string;

  constructor(private readonly endpoint: URL) {
    this.serverId = serverIdFor(endpoint);
    this.transport = new StreamableHTTPClientTransport(endpoint);
  }

  async connect(): Promise<void> {
    await this.client.connect(this.transport);
    this.connected = true;
  }

  isConnected(): boolean {
    return this.connected;
  }

  async listTools(): Promise<{ tools: Tool[] }> {
    if (!this.cachedTools) {
      const { tools } = await this.client.listTools();
      this.cachedTools = tools;
    }
    return { tools: this.cachedTools };
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    return this.client.callTool({ name, arguments: args });
  }

  getServerId(): string { return this.serverId; }
  getServerName(): string { return this.endpoint.hostname; }
  getServerUrl(): string { return this.endpoint.toString(); }
  getSessionId(): string { return `cli:${this.serverId}`; }

  async close(): Promise<void> {
    this.connected = false;
    await this.client.close();
  }
}

export async function connectRemote(endpoint: string): Promise<RemoteToolClient> {
  const url = new URL(endpoint);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("MCP endpoint must use http:// or https://");
  }
  const client = new RemoteToolClient(url);
  try {
    await client.connect();
    return client;
  } catch (error) {
    await client.close().catch(() => undefined);
    throw error;
  }
}
