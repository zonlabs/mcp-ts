import type { ToolServer, ToolDefinition } from "../types.js";

type McpTextContent = {
  type?: unknown;
  text?: unknown;
};

type McpCallToolEnvelope = {
  structuredContent?: unknown;
  content?: unknown;
  isError?: unknown;
};

export interface ToolClient {
  listTools(): Promise<{ tools: ToolDefinition[] }>;
  callTool(name: string, args: Record<string, unknown>): Promise<unknown>;
  getServerId?(): string | undefined;
  getServerName?(): string | undefined;
  getServerUrl?(): string | undefined;
}

export interface ToolClientProvider {
  getClients(): ToolClient[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function normalizeMcpToolResult(result: unknown): unknown {
  if (!isRecord(result)) {
    return result;
  }

  const envelope = result as McpCallToolEnvelope;
  if (envelope.structuredContent !== undefined) {
    return envelope.structuredContent;
  }

  const content = Array.isArray(envelope.content) ? envelope.content : null;
  if (content?.length === 1) {
    const item = content[0] as McpTextContent;
    if (item?.type === "text" && typeof item.text === "string") {
      const parsed = tryParseJson(item.text);
      if (envelope.isError) {
        return { content: parsed, isError: true };
      }
      return parsed;
    }
  }

  if (content) {
    return {
      content,
      isError: Boolean(envelope.isError),
    };
  }

  return result;
}

/**
 * Wraps a single MCP-like client as a ToolServer.
 */
export function mcpServer(serverId: string, client: ToolClient, serverName?: string): ToolServer {
  return {
    serverId,
    serverName: serverName ?? client.getServerName?.() ?? client.getServerId?.() ?? serverId,
    serverUrl: client.getServerUrl?.(),
    listTools: () => client.listTools(),
    callTool: async (toolName, args) => normalizeMcpToolResult(await client.callTool(toolName, args)),
    callToolRaw: (toolName, args) => client.callTool(toolName, args),
  };
}

/**
 * Creates ToolServer[] from a provider that manages multiple MCP clients
 * (e.g. McpManager).
 */
export function mcpServers(provider: ToolClientProvider): ToolServer[] {
  return provider.getClients().map((client, index) =>
    mcpServer(
      client.getServerId?.() ?? `mcp_${index + 1}`,
      client
    )
  );
}
