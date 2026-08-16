import type { Tool } from "@modelcontextprotocol/client";
import type { ToolClient } from "@mcp-ts/tool-router";
import {
  connectHttpMcpServer,
  type HttpMcpConnection,
} from "./gateway/http-mcp-client.js";

type HttpConnector = typeof connectHttpMcpServer;

function serverIdFor(url: URL): string {
  const path = url.pathname.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "");
  return `${url.hostname}${path ? `_${path}` : ""}`.toLowerCase();
}

export class RemoteToolClient implements ToolClient {
  private connection: HttpMcpConnection | null = null;
  private readonly serverId: string;

  constructor(
    private readonly endpoint: URL,
    private readonly connector: HttpConnector = connectHttpMcpServer,
  ) {
    this.serverId = serverIdFor(endpoint);
  }

  async connect(): Promise<void> {
    if (this.connection) return;
    this.connection = await this.connector(this.endpoint.toString(), {
      serverId: this.serverId,
      serverName: this.endpoint.hostname,
    });
  }

  async listTools(): Promise<{ tools: Tool[] }> {
    if (!this.connection) throw new Error("MCP client is not connected");
    return this.connection.listTools();
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    if (!this.connection) throw new Error("MCP client is not connected");
    return this.connection.callTool(name, args);
  }

  getServerId(): string { return this.serverId; }
  getServerName(): string { return this.endpoint.hostname; }
  getServerUrl(): string { return this.endpoint.toString(); }
  getSessionId(): string { return `cli:${this.serverId}`; }

  async close(): Promise<void> {
    const connection = this.connection;
    this.connection = null;
    await connection?.close();
  }
}

export async function connectRemote(
  endpoint: string,
  connector: HttpConnector = connectHttpMcpServer,
): Promise<RemoteToolClient> {
  const url = new URL(endpoint);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("MCP endpoint must use http:// or https://");
  }
  const client = new RemoteToolClient(url, connector);
  try {
    await client.connect();
    return client;
  } catch (error) {
    await client.close().catch(() => undefined);
    throw error;
  }
}
