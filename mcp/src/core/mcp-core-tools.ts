import { McpServer } from "@modelcontextprotocol/server";
import { McpManager } from "@mcp-ts/client";
import type { McpObservabilityEvent } from "@mcp-ts/client";
import {
  createToolRouter,
  mcpServers,
  type ToolRouter,
  type ToolServer,
} from "@mcp-ts/tool-router";
import { createWorkflowCodeModeRuntime } from "./codemode-runtime";
import { getRequestContext } from "./request-context";
import { asJsonObject, errorResponse, jsonResponse } from "./tool-result";
import { publishRemoteCatalogForUser } from "./bridge-session-access";
import { buildRemoteCatalogFromClients } from "./remote-catalog";
import { buildLocalToolServers } from "./local-bridge-tools";
import {
  DEFAULT_MCP_TOOL_SEARCH_LIMIT,
  listServersToolDefinition,
  searchToolsToolDefinition,
  getToolSchemasToolDefinition,
  callToolToolDefinition,
  codemodeRunToolDefinition,
} from "./mcp-core-schemas";

function handleObservability(event: McpObservabilityEvent): void {
  if (event.type === "db:read" || event.type === "db:write") {
    console.log(
      `[mcp-db][${event.type}] ${event.message} ${event.payload?.durationMs?.toFixed?.(1) ?? ""}ms`
    );
    return;
  }

  const prefix = event.serverId ? `[${event.serverId}]` : "[mcp]";
  const msg = event.message ?? "";
  switch (event.level) {
    case "error":
      console.error(`${prefix} ${msg}`);
      break;
    case "warn":
      console.warn(`${prefix} ${msg}`);
      break;
    default:
      console.log(`${prefix} ${msg}`);
  }
}

export async function getMcpManager(
  userId: string,
  options: { publishOnConnect?: boolean } = {},
): Promise<McpManager> {
  const context = getRequestContext();
  let manager!: McpManager;
  const publishCatalog = async () => {
    if (!context.env) return;
    try {
      const catalog = await buildRemoteCatalogFromClients(manager.getClients());
      await publishRemoteCatalogForUser(context.env, userId, catalog);
    } catch {
      // A downstream catalog refresh is best effort.
    }
  };
  manager = new McpManager(userId, {
    onObservabilityEvent: handleObservability,
    onToolsChanged: () => void publishCatalog(),
  });
  await manager.connect();
  if (options.publishOnConnect) {
    void publishCatalog();
  }
  return manager;
}

async function withMcpManager<T>(
  userId: string,
  fn: (manager: McpManager) => Promise<T>
): Promise<T> {
  const manager = await getMcpManager(userId);
  return await fn(manager);
}

function normalizeCodeModeScript(script: string): string {
  const trimmed = script.trim();
  if (/[\r\n]/.test(trimmed) || !/(?:\\r\\n|\\n)/.test(trimmed)) {
    return trimmed;
  }

  return trimmed.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n");
}

async function withToolRouter<T>(
  userId: string,
  fn: (router: ToolRouter, manager: McpManager) => Promise<T> | T
): Promise<T> {
  return withMcpManager(userId, async (manager) => {
    const localServers = await buildLocalToolServers();
    const servers: ToolServer[] = [
      ...mcpServers(manager),
      ...localServers.map((s) => ({
        id: s.serverId,
        name: s.serverName,
        listTools: s.listTools as never,
        callTool: s.callTool,
      })),
    ];

    const router = await createToolRouter({ servers });
    return await fn(router, manager);
  });
}

export function registerMcpCoreTools(server: McpServer): void {
  // 1. List Servers
  server.registerTool("list_mcp_servers", listServersToolDefinition, async ({ query }) => {
    try {
      const userId = getRequestContext().userId!;
      return await withToolRouter(userId, async (router) => {
        const servers = router.listServers(query);
        return jsonResponse({ servers });
      });
    } catch (err) {
      const text = err instanceof Error ? err.message : "Failed to list MCP servers";
      return { content: [{ type: "text" as const, text }], isError: true };
    }
  });

  // 2. Search Tools
  server.registerTool(
    "search_mcp_tools",
    searchToolsToolDefinition,
    async ({ query, limit, detail }) => {
      try {
        const userId = getRequestContext().userId!;
        return await withToolRouter(userId, async (router) => {
          const results = await router.searchTools({
            query,
            limit: limit ?? DEFAULT_MCP_TOOL_SEARCH_LIMIT,
            detail: detail ?? "brief",
          });
          return jsonResponse({ tools: results, total: results.length });
        });
      } catch (err) {
        const text = err instanceof Error ? err.message : "Failed to search MCP tools";
        return { content: [{ type: "text" as const, text }], isError: true };
      }
    }
  );

  // 3. Get Schemas (Plural / Batch)
  server.registerTool(
    "get_mcp_tool_schemas",
    getToolSchemasToolDefinition,
    async ({ toolIds }) => {
      try {
        const userId = getRequestContext().userId!;
        return await withToolRouter(userId, async (router) => {
          const tools = router.getToolSchemas({ toolIds });
          return jsonResponse({ tools });
        });
      } catch (err) {
        const text = err instanceof Error ? err.message : "Failed to load MCP tool schemas";
        return { content: [{ type: "text" as const, text }], isError: true };
      }
    }
  );

  // 4. Call Tool
  server.registerTool("call_mcp_tool", callToolToolDefinition, async (params) => {
    try {
      const userId = getRequestContext().userId!;
      const toolId =
        params.toolId ??
        (params.server_id ? `${params.server_id}::${params.tool_name}` : (params.tool_name ?? ""));
      const toolArgs = (params.args ?? params.arguments ?? {}) as Record<string, unknown>;

      return await withToolRouter(userId, async (router) => {
        const result = await router.callTool({ toolId, args: toolArgs });
        return result as never;
      });
    } catch (error) {
      return errorResponse(error instanceof Error ? error.message : "MCP tool call failed");
    }
  });

  // 5. CodeMode Sandbox Execution
  server.registerTool(
    "codemode_run",
    codemodeRunToolDefinition,
    async ({ script, input, timeout_ms, return_mode }) => {
      const normalizedScript = normalizeCodeModeScript(script);
      if (!normalizedScript) {
        return errorResponse("script is required");
      }

      try {
        const userId = getRequestContext().userId!;
        const manager = await getMcpManager(userId);

        const timeoutMs = Number(timeout_ms ?? process.env.MCP_SCRIPT_TIMEOUT_MS ?? 240000);
        const requestContext = getRequestContext();
        const localServers = await buildLocalToolServers(requestContext);
        const runtime = await createWorkflowCodeModeRuntime(
          manager,
          {
            timeoutMs,
            memoryLimitMb: 128,
            maxToolCalls: 50,
            maxConcurrentToolCalls: 5,
          },
          {
            userId: userId,
            requestId: requestContext.requestId,
            mcpSessionId: requestContext.mcpSessionId,
            executionCtx: requestContext.executionCtx,
          },
          {
            loader: requestContext.env?.LOADER,
          },
          localServers
        );

        const result = await runtime.run(normalizedScript, asJsonObject(input), { timeoutMs });

        const toolCalls = (result.toolCalls ?? []) as Array<Record<string, unknown>>;
        const payload: Record<string, any> = {
          success: !result.error,
          value: result.value ?? null,
          error: result.error ?? null,
          durationMs: result.durationMs,
          toolCalls: toolCalls.map((tc) => ({
            serverId: tc.serverId,
            toolName: tc.toolName,
            ok: tc.ok,
            ...(tc.durationMs !== undefined ? { durationMs: tc.durationMs } : {}),
            ...(tc.error ? { error: tc.error } : {}),
          })),
          toolCallCount: toolCalls.length,
        };

        if (return_mode === "debug") {
          payload.logs = result.logs;
        }

        payload.logCount = (result.logs ?? []).length;

        const response = jsonResponse(payload);
        if (result.error) {
          response.isError = true;
        }
        return response;
      } catch (err) {
        return errorResponse(err instanceof Error ? err.message : "CodeMode execution failed");
      }
    }
  );
}
