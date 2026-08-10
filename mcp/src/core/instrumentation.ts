import { McpServer } from "@modelcontextprotocol/server";
import { getRequestContext } from "./request-context";
import { recordMcpToolCallEvent } from "./analytics";
import { extractReturnedError } from "./mcp-tool-output";
import { errorResponse } from "./tool-result";
import { policyManager } from "./policy";

export const MCP_ASSISTANT_SERVER_ID = "mcp-assistant";
export const MCP_ASSISTANT_SERVER_NAME = "MCP Assistant";
export const MCP_ASSISTANT_SERVER_URL = "https://api.mcp-assistant.in/mcp";

function recordTopLevelToolCall(
  toolName: string,
  status: "success" | "error",
  startedAt: Date,
  durationMs: number,
  error?: unknown
): void {
  const context = getRequestContext();
  if (!context.userId?.trim() || !context.requestId?.trim()) return;

  const task = recordMcpToolCallEvent({
    userId: context.userId,
    requestId: context.requestId,
    mcpSessionId: context.mcpSessionId,
    serverId: MCP_ASSISTANT_SERVER_ID,
    serverName: MCP_ASSISTANT_SERVER_NAME,
    serverUrl: MCP_ASSISTANT_SERVER_URL,
    toolName,
    toolNamespace: MCP_ASSISTANT_SERVER_ID,
    eventType: "top_level",
    status,
    error,
    startedAt,
    completedAt: new Date(startedAt.getTime() + Math.max(0, durationMs)),
    durationMs,
  }).catch((err) => {
    console.warn("[instrumentation] Failed to record tool call event", err);
  });
  context.executionCtx?.waitUntil(task);
}

export function recordSelectedDownstreamToolSchemaInspection(tool: {
  serverId?: string;
  serverName?: string;
  serverUrl?: string;
  toolName: string;
  startedAt: Date;
  durationMs: number;
}): void {
  const context = getRequestContext();
  if (!context.userId?.trim() || !context.requestId?.trim() || !tool.toolName.trim()) return;

  const task = recordMcpToolCallEvent({
    userId: context.userId,
    requestId: context.requestId,
    mcpSessionId: context.mcpSessionId,
    serverId: tool.serverId,
    serverName: tool.serverName,
    serverUrl: tool.serverUrl,
    toolName: tool.toolName,
    toolNamespace: tool.serverId,
    eventType: "schema_inspection",
    status: "success",
    startedAt: tool.startedAt,
    completedAt: new Date(tool.startedAt.getTime() + Math.max(0, tool.durationMs)),
    durationMs: tool.durationMs,
  }).catch((err) => {
    console.warn("[instrumentation] Failed to record schema inspection event", err);
  });
  context.executionCtx?.waitUntil(task);
}

export function createInstrumentedMcpServer(
  info: { name: string; version: string },
  scopes?: string[]
): McpServer {
  const server = new McpServer(info);
  const origRegister = server.registerTool.bind(server);

  (server as unknown as Record<string, unknown>).registerTool = (
    name: unknown,
    config: any,
    cb: unknown
  ) => {
    const tags = config?._meta?.tags;
    if (tags && Array.isArray(tags)) {
      policyManager.registerToolTags(name as string, tags);
    }

    let requiredScope = "mcp:tools:execute";
    if (tags && Array.isArray(tags)) {
      if (tags.includes("admin")) {
        requiredScope = "mcp:tools:admin";
      } else if (tags.includes("read")) {
        requiredScope = "mcp:tools:read";
      } else if (tags.includes("execute")) {
        requiredScope = "mcp:tools:execute";
      }
    }

    if (scopes && !scopes.includes(requiredScope)) {
      return; // Omit unauthorized tools at registration
    }

    return origRegister(
      name as string,
      config as never,
      (async (...args: unknown[]) => {
        const startedAt = new Date();
        const startedMs = Date.now();

        const context = getRequestContext();
        if (!context.userId) {
          return errorResponse("Authenticated user not found");
        }

        // Enforce policy again from the active request context scopes
        const activeScopes = context.scopes;
        if (scopes) {
          const scopesToVerify = activeScopes || [];
          if (!scopesToVerify.includes(requiredScope)) {
            return errorResponse(`Access Denied: Missing required scope '${requiredScope}'`);
          }
        } else if (activeScopes) {
          if (!activeScopes.includes(requiredScope)) {
            return errorResponse(`Access Denied: Missing required scope '${requiredScope}'`);
          }
        }

        try {
          const result = await (cb as (...a: unknown[]) => unknown)(...args);
          const returnedError = extractReturnedError(result);
          recordTopLevelToolCall(
            name as string,
            returnedError ? "error" : "success",
            startedAt,
            Date.now() - startedMs,
            returnedError
          );
          return result;
        } catch (error) {
          recordTopLevelToolCall(name as string, "error", startedAt, Date.now() - startedMs, error);
          throw error;
        }
      }) as never
    );
  };

  return server;
}
