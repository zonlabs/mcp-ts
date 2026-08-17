import {
  Client,
  type Tool,
} from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { BM25SearchStrategy, type IndexedTool } from "@mcp-ts/tool-router";
import {
  BridgeProtocolError,
  JSON_RPC_ERROR_CODES,
  type CatalogSnapshot,
  type McpServerDescriptor,
  type McpToolDescriptor,
  type ToolCallParams,
} from "@mcp-ts/bridge-protocol";
import type { HttpServerConfig, McpServerConfig } from "./types.js";
import {
  connectHttpMcpServer,
  type HttpMcpConnection,
} from "./http-mcp-client.js";
import { CLI_VERSION, error as uxError, serverLog } from "../ux.js";
import { Traffic } from "../traffic.js";

function isHttpServerConfig(config: McpServerConfig): config is HttpServerConfig {
  return "url" in config;
}

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

export class LocalMcpConnection {
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;
  private httpConnection: HttpMcpConnection | null = null;
  private tools: McpToolDescriptor[] = [];

  constructor(
    readonly id: string,
    readonly name: string,
    private readonly config: McpServerConfig,
    private readonly verbose: boolean = false,
    private readonly connectHttp: typeof connectHttpMcpServer = connectHttpMcpServer,
  ) {}

  private createTransport(): StdioClientTransport {
    if (isHttpServerConfig(this.config)) {
      throw new Error(`HTTP MCP server "${this.name}" cannot use a stdio transport.`);
    }
    return new StdioClientTransport({
      command: this.config.command,
      args: this.config.args ?? [],
      env: this.config.env,
      cwd: this.config.cwd,
      stderr: "pipe",
    });
  }

  startupDurationMs = 0;

  async start(): Promise<void> {
    if (this.client || this.httpConnection) return;
    const startTime = performance.now();
    try {
      if (isHttpServerConfig(this.config)) {
        const url = new URL(this.config.url);
        this.httpConnection = await this.connectHttp(url.toString(), {
          serverId: this.id,
          serverName: this.name,
          headers: this.config.headers,
          transport: /\/sse(?:\/|$)/.test(url.pathname) ? "sse" : "streamable-http",
        });
        await this.loadTools();
        return;
      }
      const transport = this.createTransport();
      if (transport instanceof StdioClientTransport) {
        transport.stderr?.on("data", (chunk: unknown) => serverLog(this.name, String(chunk), this.verbose));
      }
      const client = new Client({ name: "@mcp-ts/cli", version: CLI_VERSION }, {});
      await client.connect(transport);
      this.transport = transport;
      this.client = client;
      await this.loadTools();
    } finally {
      this.startupDurationMs = Math.round(performance.now() - startTime);
    }
  }

  async loadTools(): Promise<void> {
    const result = this.httpConnection
      ? await this.httpConnection.listTools()
      : await this.client?.listTools();
    if (!result) return;
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
    if (this.httpConnection) return this.httpConnection.callTool(toolName, args);
    if (!this.client) throw new Error(`Server "${this.name}" is not started.`);
    return this.client.callTool({ name: toolName, arguments: args });
  }

  async listTools(): Promise<{ tools: McpToolDescriptor[] }> {
    return { tools: this.tools };
  }

  async stop(): Promise<void> {
    return this.close();
  }

  async close(): Promise<void> {
    try {
      await this.client?.close();
    } finally {
      this.client = null;
      this.transport = null;
      await this.httpConnection?.close();
      this.httpConnection = null;
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
  private readonly searchStrategy = new BM25SearchStrategy();
  private indexedTools: IndexedTool[] = [];
  private readonly traffic: Traffic;

  constructor(
    private readonly configs: Record<string, McpServerConfig>,
    traffic?: Traffic,
    private readonly options: {
      verbose?: boolean;
      connectHttp?: typeof connectHttpMcpServer;
    } = {},
  ) {
    this.traffic = traffic ?? new Traffic();
  }

  async start(): Promise<void> {
    await Promise.allSettled(
      Object.entries(this.configs).map(async ([name, config]) => {
        if (config.disabled) {
          return;
        }
        const id = name;
        const connection = new LocalMcpConnection(
          id,
          name,
          config,
          this.options.verbose ?? false,
          this.options.connectHttp ?? connectHttpMcpServer,
        );
        try {
          await connection.start();
          this.localConnections.set(id, connection);
        } catch (error) {
          uxError(`Failed to start MCP server "${name}": ${(error as Error).message}`);
        }
      }),
    );
    await this.rebuildIndex();
  }

  getLocalCatalog(): CatalogSnapshot {
    return {
      servers: [...this.localConnections.values()]
        .map((connection) => connection.descriptor())
        .sort((a, b) => a.serverId.localeCompare(b.serverId)),
    };
  }

  getLocalServerTimings(): Map<string, number> {
    const timings = new Map<string, number>();
    for (const [id, conn] of this.localConnections) {
      timings.set(id, conn.startupDurationMs);
    }
    return timings;
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
        toolName: route.tool.name,
        description: route.tool.description ?? "",
        serverId: route.serverId,
        serverName: route.serverName,
        inputSchema: route.tool.inputSchema,
        outputSchema: route.tool.outputSchema,
      });
    }
    this.indexedTools = indexed;
  }

  async searchTools(query: string, limit = 10, serverName?: string) {
    return this.searchStrategy.search(this.indexedTools, { query, limit, serverName }, limit).map((match) => ({
      ...match,
      name: this.routesById.get(match.toolId)?.exposedName ?? match.toolName,
    }));
  }

  getTool(reference: string): AggregatedTool | undefined {
    let targetServerId: string | undefined;
    let targetToolName = reference;
    if (reference.includes("::")) {
      const parts = reference.split("::");
      targetServerId = parts[0];
      targetToolName = parts.slice(1).join("::");
    }

    const route =
      this.routes.get(reference) ??
      this.routesById.get(reference) ??
      [...this.routesById.values()].find(
        (r) =>
          (!targetServerId ||
            r.serverId.toLowerCase() === targetServerId.toLowerCase() ||
            r.serverName.toLowerCase() === targetServerId.toLowerCase()) &&
          (r.tool.name === targetToolName ||
            canonicalToolId(r.serverId, r.tool.name) === reference ||
            `${r.serverName}::${r.tool.name}` === reference),
      );
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

  getToolsForServer(serverReference: string): AggregatedTool[] {
    const cleanRef = serverReference.toLowerCase();
    return [...this.routes.values()]
      .filter(
        (r) =>
          r.serverId.toLowerCase() === cleanRef ||
          r.serverName.toLowerCase() === cleanRef,
      )
      .map((r) => this.getTool(r.exposedName)!)
      .filter(Boolean);
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
      this.traffic.recordCall(serverId, toolName, Date.now() - started, true, undefined, args, result);
      return result;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.traffic.recordCall(serverId, toolName, Date.now() - started, false, errMsg, args);
      throw error;
    }
  }

  private async callRemoteTool(params: ToolCallParams): Promise<unknown> {
    const remote = this.remoteServers.get(params.serverId);
    if (!remote) throw new Error(`Server "${params.serverId}" is not available.`);
    if (!remote.descriptor.tools.some((tool: { name: string }) => tool.name === params.toolName)) {
      throw new Error(`Remote server "${params.serverId}" has no tool "${params.toolName}".`);
    }
    return remote.invoke(params);
  }

  async callTool(reference: string, args: Record<string, unknown>): Promise<unknown> {
    const route =
      this.routes.get(reference) ??
      this.routesById.get(reference) ??
      [...this.routesById.values()].find(
        (r) => r.tool.name === reference || canonicalToolId(r.serverId, r.tool.name) === reference,
      );
    if (!route) throw new Error(`Unknown tool "${reference}".`);
    return this.callToolByServer(route.serverId, route.tool.name, args);
  }

  async close(): Promise<void> {
    await Promise.all([...this.localConnections.values()].map((connection) => connection.close()));
    this.localConnections.clear();
    this.remoteServers.clear();
    this.routes.clear();
    this.routesById.clear();
    this.indexedTools = [];
  }
}
