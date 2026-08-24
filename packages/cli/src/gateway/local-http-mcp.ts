import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createMcpHandler, fromJsonSchema, McpServer } from "@modelcontextprotocol/server";
import type { CallToolResult } from "@modelcontextprotocol/client";
import { createToolRouter, type ToolRouter, type ToolDefinition, type ToolSearchResult } from "@mcp-ts/tool-router";
import type { McpServerDescriptor, McpToolDescriptor } from "@mcp-ts/bridge-protocol";
import type { McpGatewayRegistry } from "./registry.js";
import type { Traffic } from "../traffic.js";
import { CLI_VERSION } from "../ux.js";

import { MCP_META_TOOL_NAMES, META_TOOL_NAMES_SET } from "../constants.js";
import {
  createGatewayGeneration,
  type GatewayHealth,
  type GatewayMode,
} from "./gateway-health.js";

export { MCP_META_TOOL_NAMES };

export type LocalMcpDiscoveryMode = "all" | "search";

export type InitialCatalogOutcome =
  | { state: "ready" }
  | { state: "local-only" }
  | { state: "error"; error: Error };

export class InitialCatalogBarrier {
  private currentGeneration = 0;
  private resolver: ((outcome: InitialCatalogOutcome) => void) | null = null;
  private outcomePromise!: Promise<InitialCatalogOutcome>;
  private currentOutcome: InitialCatalogOutcome | null = null;

  constructor() {
    this.createPendingGeneration(0);
  }

  private createPendingGeneration(generation: number): void {
    this.currentGeneration = generation;
    this.currentOutcome = null;
    this.outcomePromise = new Promise<InitialCatalogOutcome>((resolve) => {
      this.resolver = resolve;
    });
  }

  getGeneration(): number {
    return this.currentGeneration;
  }

  beginActivation(): number {
    const nextGen = this.currentGeneration + 1;
    this.createPendingGeneration(nextGen);
    return nextGen;
  }

  wait(): Promise<InitialCatalogOutcome> {
    if (this.currentOutcome) return Promise.resolve(this.currentOutcome);
    return this.outcomePromise;
  }

  settle(outcome: InitialCatalogOutcome, generation?: number): boolean {
    if (generation !== undefined && generation !== this.currentGeneration) {
      return false;
    }
    const resolve = this.resolver;
    if (!resolve) return false;
    this.currentOutcome = outcome;
    this.resolver = null;
    resolve(outcome);
    return true;
  }
}

export interface LocalHttpMcpOptions {
  host: string;
  port: number;
  path: string;
  mode?: LocalMcpDiscoveryMode;
  initialCatalog?: InitialCatalogBarrier;
  identity?: {
    pid: number;
    mode: GatewayMode;
    generation: string;
  };
  activateRemote?: () => Promise<{ ready: boolean; error?: string }>;
}

export function isSearchDiscoveryMode(mode?: LocalMcpDiscoveryMode): boolean {
  return (mode ?? "search") === "search";
}

interface ParsedRequest {
  webRequest: Request;
  jsonRpc?: {
    method?: string;
    params?: Record<string, unknown>;
  };
}

async function toWebRequest(request: IncomingMessage): Promise<ParsedRequest> {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (typeof value === "string") headers.set(name, value);
    else if (Array.isArray(value)) value.forEach((item) => headers.append(name, item));
  }
  const chunks: Buffer[] = [];
  if (request.method !== "GET" && request.method !== "HEAD") {
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
  }
  const body = chunks.length > 0 ? Buffer.concat(chunks) : undefined;
  let jsonRpc: { method?: string; params?: Record<string, unknown> } | undefined;
  if (body) {
    try {
      const parsed = JSON.parse(body.toString("utf8"));
      if (parsed && typeof parsed.method === "string") {
        jsonRpc = parsed;
      }
    } catch {
      // Non-JSON payload
    }
  }

  return {
    webRequest: new Request(url, {
      method: request.method ?? "GET",
      headers,
      body,
    }),
    jsonRpc,
  };
}

async function sendWebResponse(response: ServerResponse, webResponse: Response): Promise<void> {
  response.writeHead(webResponse.status, Object.fromEntries(webResponse.headers.entries()));
  if (webResponse.body) {
    const reader = webResponse.body.getReader();
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      response.write(Buffer.from(chunk.value));
    }
  }
  response.end();
}

function textResult(value: unknown, isError = false): CallToolResult {
  return {
    content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }],
    isError,
  };
}

export class LocalHttpMcp {
  private server: ReturnType<typeof createServer> | null = null;
  private cachedRouter: ToolRouter | null = null;
  private cachedVersion = -1;
  private routerPromise: Promise<ToolRouter> | null = null;
  private readonly identity: LocalHttpMcpOptions["identity"];

  private async getOrBuildRouter(): Promise<ToolRouter> {
    const currentVersion = this.registry.getVersion();
    if (this.cachedRouter && this.cachedVersion === currentVersion) {
      return this.cachedRouter;
    }
    if (this.routerPromise) {
      return this.routerPromise;
    }

    this.routerPromise = (async () => {
      try {
        const router = await createToolRouter({
          servers: this.registry.getCombinedCatalog().servers.map((server: McpServerDescriptor) => ({
            id: server.serverId,
            name: server.serverName,
            listTools: async () => ({
              tools: server.tools.map((tool: McpToolDescriptor) => ({
                ...tool,
                annotations: tool.annotations as ToolDefinition["annotations"],
              })),
            }),
            callTool: (toolName: string, args?: Record<string, unknown>) =>
              this.registry.callToolByServer(server.serverId, toolName, args ?? {}),
          })),
        });
        this.cachedRouter = router;
        this.cachedVersion = currentVersion;
        return router;
      } finally {
        this.routerPromise = null;
      }
    })();

    return this.routerPromise;
  }

  private async waitForInitialCatalog(): Promise<void> {
    const outcome = this.options.initialCatalog
      ? await this.options.initialCatalog.wait()
      : { state: "local-only" as const };
    if (outcome.state === "error") throw outcome.error;
  }

  private async getReadyRouter(): Promise<ToolRouter> {
    await this.waitForInitialCatalog();
    return this.getOrBuildRouter();
  }

  private async createMcpServer(): Promise<McpServer> {
    const mcp = new McpServer(
      { name: "mcp-assistant-gateway", version: CLI_VERSION },
      { capabilities: { tools: {} } },
    );
    const progressive = isSearchDiscoveryMode(this.options.mode);

    if (!progressive) {
      const tools = this.registry.aggregatedTools().filter(
        (tool) => !META_TOOL_NAMES_SET.has(tool.toolName),
      );
      for (const tool of tools) {
        mcp.registerTool(
          tool.name,
          {
            description: tool.description,
            inputSchema: fromJsonSchema(tool.inputSchema as never),
          },
          async (raw: unknown) => {
            const router = await this.getReadyRouter();
            const args = (raw ?? {}) as Record<string, unknown>;
            return (await router.callTool({
              toolId: tool.toolId,
              args,
            })) as CallToolResult;
          },
        );
      }
    }

    mcp.registerTool(
      MCP_META_TOOL_NAMES.searchTools,
      {
        description: "Search connected local and remote MCP tools.",
        inputSchema: fromJsonSchema({
          type: "object",
          properties: {
            query: { type: "string" },
            serverId: { type: "string" },
            limit: { type: "number" },
            detail: { type: "string", enum: ["brief", "detailed", "full"] },
          },
          required: ["query"],
        } as never),
      },
      async (raw) => {
        const router = await this.getReadyRouter();
        const args = raw as Record<string, unknown>;
        const detail = args.detail === "brief" || args.detail === "detailed" || args.detail === "full"
          ? args.detail
          : undefined;
        const matches = await router.searchTools({
          query: String(args.query ?? ""),
          serverId: args.serverId ? String(args.serverId) : undefined,
          limit: Number(args.limit ?? 10),
          detail,
        });
        return textResult({
          tools: matches.map((match: ToolSearchResult) => {
            return {
              tool_id: match.toolId,
              server_id: match.serverId,
              server_name: match.serverName,
              tool_name: match.toolName,
              description: match.description,
            };
          }),
        });
      },
    );

    mcp.registerTool(
      MCP_META_TOOL_NAMES.listServers,
      {
        description: "List connected local and remote MCP servers.",
        inputSchema: fromJsonSchema({
          type: "object",
          properties: { query: { type: "string" } },
        } as never),
      },
      async (raw) => {
        await this.waitForInitialCatalog();
        const query = String((raw as Record<string, unknown>)?.query ?? "").toLowerCase();
        const servers = this.registry.getServerStatuses()
          .filter((server) => !query
            || server.serverId.toLowerCase().includes(query)
            || server.serverName.toLowerCase().includes(query))
          .map((server) => ({
            server_id: server.serverId,
            server_name: server.serverName,
            source: server.source,
            tool_count: server.toolCount,
            discovery_state: server.discoveryState,
            ...(server.error ? { error: server.error } : {}),
          }));
        return textResult({ servers });
      },
    );

    mcp.registerTool(
      MCP_META_TOOL_NAMES.getToolSchemas,
      {
        description: "Get input and output schema details for discovered tools before calling them.",
        inputSchema: fromJsonSchema({
          type: "object",
          properties: {
            toolIds: { type: "array", items: { type: "string" } },
          },
          required: ["toolIds"],
        } as never),
      },
      async (raw) => {
        const router = await this.getReadyRouter();
        const args = raw as { toolIds?: string[] };
        const tools = router.getToolSchemas({
          toolIds: args.toolIds ?? [],
        });
        return textResult({ tools });
      },
    );

    mcp.registerTool(
      MCP_META_TOOL_NAMES.callTool,
      {
        description: "Execute one discovered local or remote MCP tool.",
        inputSchema: fromJsonSchema({
          type: "object",
          properties: {
            toolId: { type: "string" },
            args: { type: "object" },
            server_id: { type: "string" },
            tool_name: { type: "string" },
            arguments: { type: "object" },
          },
        } as never),
      },
      async (raw) => {
        const router = await this.getReadyRouter();
        const args = raw as Record<string, unknown>;
        const toolId = String(
          args.toolId ??
            (args.server_id ? `${String(args.server_id)}::${String(args.tool_name)}` : (args.tool_name ?? ""))
        );
        const toolArgs = (args.args ?? args.arguments ?? {}) as Record<string, unknown>;

        try {
          return (await router.callTool({
            toolId,
            args: toolArgs,
          })) as CallToolResult;
        } catch (error) {
          return textResult(error instanceof Error ? error.message : "Tool call failed", true);
        }
      },
    );
    return mcp;
  }

  private readonly handler = createMcpHandler(async () => this.createMcpServer());

  constructor(
    private readonly registry: McpGatewayRegistry,
    private readonly options: LocalHttpMcpOptions,
    private readonly traffic: Traffic,
  ) {
    this.identity = options.identity ?? {
      pid: process.pid,
      mode: process.env.MCPA_DAEMON === "1" ? "daemon" : "foreground",
      generation: createGatewayGeneration(),
    };
  }

  getHealth(): GatewayHealth {
    const address = this.server?.address();
    const port = typeof address === "object" && address ? address.port : this.options.port;
    return {
      status: "ok",
      pid: this.identity!.pid,
      port,
      mode: this.identity!.mode,
      generation: this.identity!.generation,
    };
  }

  async start(): Promise<string> {
    this.server = createServer(async (request, response) => {
      const started = Date.now();
      try {
        const { webRequest, jsonRpc } = await toWebRequest(request);
        if (new URL(webRequest.url).pathname === "/healthz" && webRequest.method === "GET") {
          response.writeHead(200, { "content-type": "application/json" });
          response.end(JSON.stringify(this.getHealth()));
          return;
        }
        if (new URL(webRequest.url).pathname === "/activate-remote" && webRequest.method === "POST") {
          if (!this.options.activateRemote) {
            response.writeHead(503, { "content-type": "application/json" });
            response.end(JSON.stringify({ ready: false, error: "Remote activation is unavailable." }));
            return;
          }
          const outcome = await this.options.activateRemote();
          response.writeHead(outcome.ready ? 200 : 503, { "content-type": "application/json" });
          response.end(JSON.stringify(outcome));
          return;
        }
        if (new URL(webRequest.url).pathname !== this.options.path) {
          response.writeHead(404, { "content-type": "application/json" });
          response.end(JSON.stringify({ error: "Not found" }));
          return;
        }
        const webResponse = await this.handler.fetch(webRequest);
        const latencyMs = Date.now() - started;
        const method = jsonRpc?.method ?? `${webRequest.method} ${this.options.path}`;
        const target =
          jsonRpc?.method === "tools/call"
            ? String(jsonRpc.params?.name ?? jsonRpc.params?.toolId ?? jsonRpc.params?.tool_name ?? "")
            : undefined;

        this.traffic.recordIncoming({
          protocol: "JSON-RPC",
          method,
          target,
          latencyMs,
          status: webResponse.status,
          args: jsonRpc?.params?.arguments ?? jsonRpc?.params?.args ?? (jsonRpc?.method !== "tools/call" ? jsonRpc?.params : undefined),
        });
        await sendWebResponse(response, webResponse);
      } catch (error) {
        this.traffic.recordError("local endpoint", (error as Error).message);
        response.writeHead(500, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: "Internal server error" }));
      }
    });
    await new Promise<void>((resolve, reject) => {
      this.server!.once("error", reject);
      this.server!.listen(this.options.port, this.options.host, resolve);
    });
    const address = this.server!.address();
    const actualPort = typeof address === "object" && address ? address.port : this.options.port;
    return `http://${this.options.host}:${actualPort}${this.options.path}`;
  }

  async close(): Promise<void> {
    const server = this.server;
    this.server = null;
    if (!server) return;
    await new Promise<void>((resolve) => {
      server.closeAllConnections?.();
      server.close(() => resolve());
    });
  }
}
