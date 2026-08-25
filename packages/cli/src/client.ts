import type { Tool } from "@modelcontextprotocol/client";
import type { ToolClient } from "@mcp-ts/tool-router";
import {
  connectHttpMcpServer,
  type HttpMcpConnection,
} from "./gateway/http-mcp-client.js";
import {
  ensureFreshAuthSession,
  loadAuthSession,
} from "./gateway/auth-store.js";

type HttpConnector = typeof connectHttpMcpServer;

export interface McpEndpointClientOptions {
  headers?: Record<string, string>;
  connector?: HttpConnector;
  onProgress?: (message: string) => void;
}

function serverIdFor(url: URL): string {
  const path = url.pathname.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "");
  return `${url.hostname}${path ? `_${path}` : ""}`.toLowerCase();
}

export class McpEndpointClient implements ToolClient {
  private connection: HttpMcpConnection | null = null;
  private readonly serverId: string;
  private readonly headers?: Record<string, string>;
  private readonly connector: HttpConnector;
  private readonly onProgress?: (message: string) => void;

  constructor(
    private readonly endpoint: URL,
    optionsOrConnector?: McpEndpointClientOptions | HttpConnector,
  ) {
    this.serverId = serverIdFor(endpoint);
    if (typeof optionsOrConnector === "function") {
      this.connector = optionsOrConnector;
    } else {
      this.connector = optionsOrConnector?.connector ?? connectHttpMcpServer;
      this.headers = optionsOrConnector?.headers;
      this.onProgress = optionsOrConnector?.onProgress;
    }
  }

  async connect(): Promise<void> {
    if (this.connection) return;
    let headers: Record<string, string> | undefined = this.headers;
    const origin = this.endpoint.origin;
    if (!headers && loadAuthSession(origin)) {
      try {
        const session = await ensureFreshAuthSession(origin);
        headers = { Authorization: `Bearer ${session.accessToken}` };
      } catch {
        // Fall back to unauthenticated connection or browser OAuth
      }
    }
    this.connection = await this.connector(this.endpoint.toString(), {
      serverId: this.serverId,
      serverName: this.endpoint.hostname,
      headers,
      onProgress: this.onProgress,
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

export async function connectMcpEndpoint(
  endpoint: string,
  optionsOrConnector?: McpEndpointClientOptions | HttpConnector | Record<string, string>,
): Promise<McpEndpointClient> {
  const url = new URL(endpoint);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("MCP endpoint must use http:// or https://");
  }
  if (!url.pathname || url.pathname === "/") {
    url.pathname = "/mcp";
  }

  let options: McpEndpointClientOptions | HttpConnector | undefined;
  if (
    optionsOrConnector &&
    typeof optionsOrConnector === "object" &&
    typeof (optionsOrConnector as any).connector !== "function" &&
    !("headers" in optionsOrConnector)
  ) {
    options = { headers: optionsOrConnector as Record<string, string> };
  } else {
    options = optionsOrConnector as McpEndpointClientOptions | HttpConnector | undefined;
  }

  const client = new McpEndpointClient(url, options);
  try {
    await client.connect();
    return client;
  } catch (error) {
    await client.close().catch(() => undefined);
    throw error;
  }
}
