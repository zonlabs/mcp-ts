import {
  Client,
  SSEClientTransport,
  StreamableHTTPClientTransport,
  type Tool,
} from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { ToolIndex, type IndexedTool } from "@mcp-ts/client/shared";
import {
  BridgeProtocolError,
  JSON_RPC_ERROR_CODES,
  type CatalogSnapshot,
  type McpServerDescriptor,
  type McpToolDescriptor,
  type ToolCallParams,
} from "@mcp-ts/bridge-protocol";
import type { StdioServerConfig } from "./types.js";
import { error as uxError, serverLog } from "../ux.js";
import { Traffic } from "../traffic.js";

type LocalServerConfig = StdioServerConfig & {
  url?: string;
  headers?: Record<string, string>;
};

type McpTransport = StdioClientTransport | StreamableHTTPClientTransport | SSEClientTransport;

export interface AggregatedTool {
  name: string;
  toolId: string;
  serverId: string;
  serverName: string;
  toolName: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
}

export function canonicalToolId(serverId: string, toolName: string): string {
  return `${serverId}::${toolName}`;
}

class LocalMcpConnection {
  private client: Client | null = null;
  private transport: McpTransport | null = null;
  private tools: McpToolDescriptor[] = [];

  constructor(
    readonly id: string,
    readonly name: string,
    private readonly config: LocalServerConfig,
    private readonly verbose: boolean,
  ) {}

  private createTransport(): McpTransport {
    if (this.config.url) {
      const url = new URL(this.config.url);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new Error(`Unsupported URL protocol "${url.protocol}" for MCP server "${this.name}".`);
      }
      const options = this.config.headers
        ? { requestInit: { headers: this.config.headers } }
        : undefined;
      return /\/sse(?:\/|$)/.test(url.pathname)
        ? new SSEClientTransport(url, options)
        : new StreamableHTTPClientTransport(url, options);
    }
    if (!this.config.command) {
      throw new Error(`MCP server "${this.name}" needs either "command" or "url".`);
    }
    return new StdioClientTransport({
      command: this.config.command,
      args: this.config.args ?? [],
      env: this.config.env,
      cwd: this.config.cwd,
      stderr: "pipe",
    });
  }

  async start(): Promise<void> {
    if (this.client) return;
    const transport = this.createTransport();
    if (transport instanceof StdioClientTransport) {
      transport.stderr?.on("data", (chunk: unknown) => serverLog(this.name, String(chunk), this.verbose));
    }
    const client = new Client({ name: "@mcp-ts/cli", version: "0.1.4" }, {});
    await client.connect(transport);
    this.transport = transport;
    this.client = client;
    await this.refreshTools();
  }

  async refreshTools(): Promise<void> {
    if (!this.client) return;
    const result = await this.client.listTools();
    this.tools = (result.tools ?? []).map((tool: Tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: (tool.inputSchema ?? { type: "object" }) as Record<string, unknown>,
      outputSchema: tool.outputSchema as Record<string, unknown> | undefined,
      annotations: tool.annotations,
    }));
  }

  descriptor(): McpServerDescriptor {
    return { serverId: this.id, serverName: this.name, tools: this.tools };
  }

  hasTool(toolName: string): boolean {
    return this.tools.some((tool) => tool.name === toolName);
  }

  async callTool(toolName: string, args: Record<string, unknown>): Promise<unknown> {
    if (!this.client) throw new Error(`Server "${this.name}" is not started.`);
    return this.client.callTool({ name: toolName, arguments: args });
  }

  async close(): Promise<void> {
    try {
      await this.client?.close();
    } finally {
      this.client = null;
      this.transport = null;
    }
  }
}

interface RemoteServer {
  descriptor: McpServerDescriptor;
  invoke: (params: ToolCallParams) => Promise<unknown>;
}

interface ToolRoute {
  source: "local" | "remote";
  serverId: string;
  serverName: string;
  tool: McpToolDescriptor;
  exposedName: string;
}

export class McpGatewayRegistry {
  private readonly localConnections = new Map<string, LocalMcpConnection>();
  private readonly remoteServers = new Map<string, RemoteServer>();
  private readonly routes = new Map<string, ToolRoute>();
  private readonly routesById = new Map<string, ToolRoute>();
  private readonly toolIndex = new ToolIndex();
  private readonly traffic: Traffic;

  constructor(
    private readonly configs: Record<string, LocalServerConfig>,
    traffic?: Traffic,
    private readonly options: { verbose?: boolean } = {},
  ) {
    this.traffic = traffic ?? new Traffic();
  }

  async start(): Promise<void> {
    for (const [name, config] of Object.entries(this.configs)) {
      const id = `local:${name}`;
      const connection = new LocalMcpConnection(id, name, config, this.options.verbose ?? false);
      try {
        await connection.start();
        this.localConnections.set(id, connection);
      } catch (error) {
        uxError(`Failed to start MCP server "${name}": ${(error as Error).message}`);
      }
    }
    await this.rebuildIndex();
  }

  getLocalCatalog(): CatalogSnapshot {
    return {
      servers: [...this.localConnections.values()]
        .map((connection) => connection.descriptor())
        .sort((a, b) => a.serverId.localeCompare(b.serverId)),
    };
  }

  getRemoteCatalog(): CatalogSnapshot {
    return {
      servers: [...this.remoteServers.values()]
        .map(({ descriptor }) => descriptor)
        .sort((a, b) => a.serverId.localeCompare(b.serverId)),
    };
  }

  getCombinedCatalog(): CatalogSnapshot {
    return { servers: [...this.getLocalCatalog().servers, ...this.getRemoteCatalog().servers] };
  }

  async replaceRemoteCatalog(
    catalog: CatalogSnapshot,
    invoke: (params: ToolCallParams) => Promise<unknown>,
  ): Promise<void> {
    this.remoteServers.clear();
    for (const descriptor of catalog.servers) {
      if (this.localConnections.has(descriptor.serverId)) {
        throw new Error(`Remote server ID collides with local server ID: ${descriptor.serverId}`);
      }
      this.remoteServers.set(descriptor.serverId, { descriptor, invoke });
    }
    await this.rebuildIndex();
  }

  private allRoutes(): ToolRoute[] {
    const routes: ToolRoute[] = [];
    for (const connection of this.localConnections.values()) {
      const descriptor = connection.descriptor();
      for (const tool of descriptor.tools) {
        routes.push({
          source: "local",
          serverId: descriptor.serverId,
          serverName: descriptor.serverName,
          tool,
          exposedName: tool.name,
        });
      }
    }
    for (const { descriptor } of this.remoteServers.values()) {
      for (const tool of descriptor.tools) {
        routes.push({
          source: "remote",
          serverId: descriptor.serverId,
          serverName: descriptor.serverName,
          tool,
          exposedName: tool.name,
        });
      }
    }
    return routes.sort((a, b) =>
      canonicalToolId(a.serverId, a.tool.name).localeCompare(canonicalToolId(b.serverId, b.tool.name)),
    );
  }

  private async rebuildIndex(): Promise<void> {
    this.routes.clear();
    this.routesById.clear();
    const routes = this.allRoutes();
    const counts = new Map<string, number>();
    for (const route of routes) counts.set(route.tool.name, (counts.get(route.tool.name) ?? 0) + 1);
    const indexed: IndexedTool[] = [];
    for (const route of routes) {
      const toolId = canonicalToolId(route.serverId, route.tool.name);
      route.exposedName = counts.get(route.tool.name) === 1 ? route.tool.name : toolId;
      this.routes.set(route.exposedName, route);
      this.routesById.set(toolId, route);
      indexed.push({
        name: route.exposedName,
        description: route.tool.description ?? "",
        inputSchema: route.tool.inputSchema as never,
        serverId: route.serverId,
        serverName: route.serverName,
        sessionId: route.source,
      });
    }
    await this.toolIndex.buildIndex(indexed);
  }

  async searchTools(query: string, limit = 10, serverName?: string) {
    return this.toolIndex.search(query, limit, { serverName });
  }

  getTool(reference: string): AggregatedTool | undefined {
    const route = this.routes.get(reference) ?? this.routesById.get(reference);
    if (!route) return undefined;
    return {
      name: route.exposedName,
      toolId: canonicalToolId(route.serverId, route.tool.name),
      serverId: route.serverId,
      serverName: route.serverName,
      toolName: route.tool.name,
      description: route.tool.description,
      inputSchema: route.tool.inputSchema,
      outputSchema: route.tool.outputSchema,
    };
  }

  aggregatedTools(): AggregatedTool[] {
    return [...this.routes.values()].map((route) => this.getTool(route.exposedName)!).filter(Boolean);
  }

  async callLocalTool(params: ToolCallParams): Promise<unknown> {
    const connection = this.localConnections.get(params.serverId);
    if (!connection) {
      throw new BridgeProtocolError(
        JSON_RPC_ERROR_CODES.serverUnavailable,
        `Local server "${params.serverId}" is not running.`,
      );
    }
    if (!connection.hasTool(params.toolName)) {
      throw new BridgeProtocolError(
        JSON_RPC_ERROR_CODES.toolNotFound,
        `Local server "${params.serverId}" has no tool "${params.toolName}".`,
      );
    }
    return connection.callTool(params.toolName, params.arguments);
  }

  async callToolByServer(
    serverId: string,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    const started = Date.now();
    try {
      const local = this.localConnections.get(serverId);
      const result = local
        ? await this.callLocalTool({ serverId, toolName, arguments: args })
        : await this.callRemoteTool({ serverId, toolName, arguments: args });
      this.traffic.recordCall(serverId, toolName, Date.now() - started, true);
      return result;
    } catch (error) {
      this.traffic.recordCall(serverId, toolName, Date.now() - started, false);
      throw error;
    }
  }

  private async callRemoteTool(params: ToolCallParams): Promise<unknown> {
    const remote = this.remoteServers.get(params.serverId);
    if (!remote) throw new Error(`Server "${params.serverId}" is not available.`);
    if (!remote.descriptor.tools.some((tool) => tool.name === params.toolName)) {
      throw new Error(`Remote server "${params.serverId}" has no tool "${params.toolName}".`);
    }
    return remote.invoke(params);
  }

  async callTool(reference: string, args: Record<string, unknown>): Promise<unknown> {
    const route = this.routes.get(reference) ?? this.routesById.get(reference);
    if (!route) throw new Error(`Unknown tool "${reference}".`);
    return this.callToolByServer(route.serverId, route.tool.name, args);
  }

  async close(): Promise<void> {
    await Promise.all([...this.localConnections.values()].map((connection) => connection.close()));
    this.localConnections.clear();
    this.remoteServers.clear();
    this.routes.clear();
    this.routesById.clear();
  }
}
