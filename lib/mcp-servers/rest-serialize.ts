import type { Category, McpServer } from "@/types/mcp";
import { mapCategoryRow, type CategoryRow, type McpServerNode } from "./types";

export function restCategory(row: CategoryRow): Category {
  return mapCategoryRow(row);
}

/** Plain REST JSON shape for one MCP server (matches `McpServer` UI type). */
export function restMcpServer(
  node: McpServerNode,
  options: { includeHeaders?: boolean } = {}
): McpServer {
  const server: McpServer = {
    id: node.id,
    name: node.name,
    description: node.description,
    categories: node.categories,
    transport: node.transport,
    owner: node.owner,
    url: node.url,
    icon: node.icon,
    isVerified: node.isVerified,
    requiresOauth2: node.requiresOauth2,
    isPublic: node.isPublic,
    connectionStatus: undefined,
    tools: [],
    updated_at: node.updatedAt,
    createdAt: node.createdAt,
  };

  if (options.includeHeaders && node.headers) {
    server.headers = node.headers;
  }

  return server;
}
