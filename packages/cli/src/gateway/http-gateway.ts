import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createMcpHandler, fromJsonSchema, McpServer } from "@modelcontextprotocol/server";
import type { CallToolResult } from "@modelcontextprotocol/client";
import { createToolRouter, type ToolDefinition } from "@mcp-ts/tool-router";
import type { McpGatewayRegistry } from "./registry.js";
import type { Traffic } from "../traffic.js";

export const MCP_META_TOOL_NAMES = {
  listServers: "list_mcp_servers",
  searchTools: "search_mcp_tools",
  getToolSchema: "get_mcp_tool_schema",
  callTool: "call_mcp_tool",
} as const;

export interface HttpMcpGatewayOptions {
  host: string;
  port: number;
  path: string;
  mode?: "all" | "search" | "auto";
  maxDirectTools?: number;
}

async function toWebRequest(request: IncomingMessage): Promise<Request> {
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
  return new Request(url, {
    method: request.method ?? "GET",
    headers,
    body: chunks.length > 0 ? Buffer.concat(chunks) : undefined,
  });
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

export class HttpMcpGateway {
  private server: ReturnType<typeof createServer> | null = null;
  private readonly handler = createMcpHandler(async () => {
    const mcp = new McpServer(
      { name: "mcp-assistant-gateway", version: "0.1.4" },
      { capabilities: { tools: {} } },
    );
    const tools = this.registry.aggregatedTools();
    const router = await createToolRouter({
      servers: this.registry.getCombinedCatalog().servers.map((server) => ({
        id: server.serverId,
        name: server.serverName,
        listTools: async () => ({
          tools: server.tools.map((tool) => ({
            ...tool,
            annotations: tool.annotations as ToolDefinition["annotations"],
          })),
        }),
        callTool: (toolName, args) =>
          this.registry.callToolByServer(server.serverId, toolName, args),
      })),
    });
    const progressive =
      this.options.mode === "search" ||
      ((this.options.mode ?? "auto") === "auto" && tools.length > (this.options.maxDirectTools ?? 15));

    if (!progressive) {
      for (const tool of tools) {
        mcp.registerTool(
          tool.name,
          {
            description: tool.description,
            inputSchema: fromJsonSchema(tool.inputSchema as never),
          },
          async (args) =>
            (await router.callTool({
              toolId: tool.toolId,
              args: (args ?? {}) as Record<string, unknown>,
            })) as CallToolResult,
        );
      }
      return mcp;
    }

    mcp.registerTool(
      MCP_META_TOOL_NAMES.searchTools,
      {
        description: "Search connected local and remote MCP tools.",
        inputSchema: fromJsonSchema({
          type: "object",
          properties: {
            query: { type: "string" },
            server_name: { type: "string" },
            limit: { type: "number" },
          },
          required: ["query"],
        } as never),
      },
      async (raw) => {
        const args = raw as Record<string, unknown>;
        const matches = await router.searchTools({
          query: String(args.query ?? ""),
          limit: Number(args.limit ?? 10),
          serverName: args.server_name ? String(args.server_name) : undefined,
        });
        return textResult(
          matches.map((match) => {
            return {
              tool_id: match.toolId,
              server_id: match.serverId,
              server_name: match.serverName,
              tool_name: match.toolName,
              description: match.description,
            };
          }),
        );
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
        const query = String((raw as Record<string, unknown>)?.query ?? "").toLowerCase();
        const servers = router.listServers(query).map((server) => ({
          server_id: server.serverId,
          server_name: server.serverName,
          tool_count: server.toolCount,
        }));
        return textResult({ servers });
      },
    );

    mcp.registerTool(
      MCP_META_TOOL_NAMES.getToolSchema,
      {
        description: "Get the schema for one discovered MCP tool.",
        inputSchema: fromJsonSchema({
          type: "object",
          properties: {
            server_id: { type: "string" },
            tool_name: { type: "string" },
          },
          required: ["server_id", "tool_name"],
        } as never),
      },
      async (raw) => {
        const args = raw as Record<string, unknown>;
        const [tool] = router.getToolSchemas({
          toolIds: [`${String(args.server_id)}::${String(args.tool_name)}`],
        });
        return tool
          ? textResult({
              server_id: tool.serverId,
              server_name: tool.serverName,
              tool_name: tool.toolName,
              description: tool.description,
              input_schema: tool.inputSchema,
              output_schema: tool.outputSchema,
            })
          : textResult("Tool not found", true);
      },
    );

    mcp.registerTool(
      MCP_META_TOOL_NAMES.callTool,
      {
        description: "Execute one discovered local or remote MCP tool.",
        inputSchema: fromJsonSchema({
          type: "object",
          properties: {
            server_id: { type: "string" },
            tool_name: { type: "string" },
            arguments: { type: "object" },
          },
          required: ["server_id", "tool_name"],
        } as never),
      },
      async (raw) => {
        const args = raw as Record<string, unknown>;
        try {
          return (await router.callTool({
            toolId: `${String(args.server_id)}::${String(args.tool_name)}`,
            args: (args.arguments ?? {}) as Record<string, unknown>,
          })) as CallToolResult;
        } catch (error) {
          return textResult(error instanceof Error ? error.message : "Tool call failed", true);
        }
      },
    );
    return mcp;
  });

  constructor(
    private readonly registry: McpGatewayRegistry,
    private readonly options: HttpMcpGatewayOptions,
    private readonly traffic: Traffic,
  ) {}

  async start(): Promise<string> {
    this.server = createServer(async (request, response) => {
      const started = Date.now();
      try {
        const webRequest = await toWebRequest(request);
        if (new URL(webRequest.url).pathname !== this.options.path) {
          response.writeHead(404, { "content-type": "application/json" });
          response.end(JSON.stringify({ error: "Not found" }));
          return;
        }
        const webResponse = await this.handler.fetch(webRequest);
        this.traffic.recordIncoming("http", "", Date.now() - started, webResponse.status);
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
    return `http://${this.options.host}:${this.options.port}${this.options.path}`;
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
