export type JsonObject = Record<string, unknown>;

export function asJsonObject(value: unknown): JsonObject {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as JsonObject;
  }
  return {};
}

export type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

export function jsonResponse(output: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(output) }] };
}

export function errorResponse(message: string): ToolResult {
  return {
    content: [{ type: "text", text: `Error: ${message}` }],
    isError: true,
  };
}

/** Second argument to MCP tool handlers (auth from mcp-handler / Streamable HTTP). */
export type ToolExtra = { authInfo?: { extra?: Record<string, unknown> } };
