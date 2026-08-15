import {
  Client,
  StreamableHTTPClientTransport,
  SSEClientTransport,
} from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import type { Tool } from "@modelcontextprotocol/server";
import type {
  AggregatedTool,
  ServerInfo,
  StdioServerConfig,
  ToolInfo,
} from "./types.js";
import { error as uxError, serverLog } from "../ux.js";
import type { Traffic } from "../traffic.js";

export interface ManagedServerHandle {
  name: string;
  client: Client;
  transport:
    | StdioClientTransport
    | StreamableHTTPClientTransport
    | SSEClientTransport;
  serverInfo: ServerInfo;
  close: () => Promise<void>;
}

/**
 * Wraps a single local MCP server configuration (stdio or HTTP/SSE) in an
 * official-sdk Client and exposes its tools.
 */
export class ManagedServer {
  readonly name: string;
  private client: Client | null = null;
  private transport:
    | StdioClientTransport
    | StreamableHTTPClientTransport
    | SSEClientTransport
    | null = null;
  private tools: Record<string, ToolInfo> = {};

  constructor(
    name: string,
    private config: StdioServerConfig & { url?: string; headers?: Record<string, string> },
  ) {
    this.name = name;
  }

  private buildTransport() {
    if (this.config.url) {
      const url = new URL(this.config.url);
      const headers =
        this.config.headers ??
        (this.config as { headers?: Record<string, string> }).headers;
      const opts = {
        requestInit: headers ? { headers } : undefined,
      };
      const protocol = url.protocol;
      if (protocol === "http:" || protocol === "https:") {
        // streamable-http unless the URL path looks like an SSE endpoint
        if (/\/sse(\?|$)/.test(url.pathname)) {
          return new SSEClientTransport(url, opts);
        }
        return new StreamableHTTPClientTransport(url, opts);
      }
      throw new Error(
        `Unsupported URL protocol "${protocol}" for MCP server "${this.name}".`,
      );
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

  /**
   * Capture the child process's stderr (piped in buildTransport) and re-emit it
   * prefixed + dimmed so server chatter doesn't bleed raw into the CLI output.
   */
  private forwardStderr(transport: ManagedServerHandle["transport"]): void {
    if (!(transport instanceof StdioClientTransport)) return;
    const stream = (transport as unknown as { stderr?: NodeJS.ReadableStream }).stderr;
    if (!stream) return;
    stream.on("data", (chunk: unknown) => {
      serverLog(this.name, String(chunk));
    });
  }

  async start(): Promise<void> {
    if (this.client) return;
    const transport = this.buildTransport();
    this.forwardStderr(transport);
    const client = new Client(
      { name: "@mcp-ts/cli", version: "0.1.0" },
      {},
    );
    await client.connect(transport);
    this.transport = transport;
    this.client = client;
    await this.refreshTools();
  }

  /** Re-fetch tools/list from the local server. */
  async refreshTools(): Promise<void> {
    if (!this.client) return;
    const result = await this.client.listTools();
    const tools: Record<string, ToolInfo> = {};
    for (const t of (result.tools ?? []) as Tool[]) {
      tools[t.name] = {
        name: t.name,
        description: t.description,
        inputSchema: (t.inputSchema ?? { type: "object" }) as Record<string, unknown>,
        annotations: t.annotations,
      };
    }
    this.tools = tools;
  }

  getServerInfo(): ServerInfo {
    return {
      name: this.name,
      kind: this.config.url
        ? /\/sse(\?|$)/.test(new URL(this.config.url).pathname)
          ? "sse"
          : "streamable-http"
        : "stdio",
      tools: this.tools,
    };
  }

  hasTool(name: string): boolean {
    return name in this.tools;
  }

  /** Invoke a tool via the SDK client (SEP-2243 header mirroring handled internally). */
  async callTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    if (!this.client) throw new Error(`Server "${this.name}" is not started.`);
    const result = await this.client.callTool({ name, arguments: args });
    return result as unknown as Record<string, unknown>;
  }

  async close(): Promise<void> {
    await this.client?.close();
    this.client = null;
    this.transport = null;
  }
}

/**
 * Manages all configured local MCP servers, aggregates their tools into one
 * flat namespace (collisions prefixed with the server name), and dispatches
 * tool calls to the owning server.
 */
export class ServerManager {
  private servers = new Map<string, ManagedServer>();
  /** Aggregated view: exposedName -> { server, originalName } */
  private index = new Map<string, { server: string; originalName: string }>();

  constructor(
    private configs: Record<string, StdioServerConfig & { url?: string }>,
    private traffic: Traffic,
  ) {}

  async start(): Promise<void> {
    for (const [name, cfg] of Object.entries(this.configs)) {
      const server = new ManagedServer(name, cfg);
      try {
        await server.start();
        this.servers.set(name, server);
      } catch (err) {
        uxError(`Failed to start MCP server "${name}": ${(err as Error).message}`);
      }
    }
    this.rebuildIndex();
  }

  private rebuildIndex(): void {
    this.index.clear();
    for (const server of this.servers.values()) {
      const info = server.getServerInfo();
      for (const toolName of Object.keys(info.tools)) {
        let exposed = toolName;
        // Flat merge: collisions prefixed with server name.
        if (this.index.has(toolName)) {
          exposed = `${server.name}:${toolName}`;
          while (this.index.has(exposed)) exposed = `${server.name}:${toolName}@${crypto.randomUUID().slice(0, 6)}`;
        }
        this.index.set(exposed, { server: server.name, originalName: toolName });
      }
    }
  }

  /** Aggregated tools for the MCP endpoint (tools/list). */
  aggregatedTools(): AggregatedTool[] {
    const tools: AggregatedTool[] = [];
    for (const [exposed, { server, originalName }] of this.index) {
      const info = this.servers.get(server)!.getServerInfo().tools[originalName];
      tools.push({
        name: exposed,
        server,
        originalName,
        description: info.description,
        inputSchema: info.inputSchema,
      });
    }
    return tools;
  }

  serverInfos(): ServerInfo[] {
    return [...this.servers.values()].map((s) => s.getServerInfo());
  }

  /** Dispatch a call to a specific server by name (unambiguous across devices). */
  async callToolByServer(
    serverName: string,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const server = this.servers.get(serverName);
    if (!server) throw new Error(`Server "${serverName}" is not running.`);
    if (!server.hasTool(toolName)) {
      throw new Error(`Server "${serverName}" has no tool "${toolName}".`);
    }
    const started = Date.now();
    try {
      const result = await server.callTool(toolName, args);
      this.traffic.recordCall(serverName, toolName, Date.now() - started, true);
      return result;
    } catch (err) {
      this.traffic.recordCall(serverName, toolName, Date.now() - started, false);
      throw err;
    }
  }

  /** Dispatch a call to the owning server by exposed tool name. */
  async callTool(
    exposedName: string,
    args: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const entry = this.index.get(exposedName);
    if (!entry) {
      throw new Error(`Unknown tool "${exposedName}".`);
    }
    const server = this.servers.get(entry.server);
    if (!server) throw new Error(`Server "${entry.server}" is not running.`);
    const started = Date.now();
    try {
      const result = await server.callTool(entry.originalName, args);
      this.traffic.recordCall(entry.server, entry.originalName, Date.now() - started, true);
      return result;
    } catch (err) {
      this.traffic.recordCall(entry.server, entry.originalName, Date.now() - started, false);
      throw err;
    }
  }

  async close(): Promise<void> {
    await Promise.all([...this.servers.values()].map((s) => s.close()));
    this.servers.clear();
    this.index.clear();
  }
}
