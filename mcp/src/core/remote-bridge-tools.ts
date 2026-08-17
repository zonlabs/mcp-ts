/**
 * @file mcp/src/core/remote-bridge-tools.ts
 * @description Provides remote catalog building and direct tool dispatch for bridge sessions.
 */

import type {
  CatalogSnapshot,
  ToolCallParams,
} from "@mcp-ts/bridge-protocol";
import { BridgeProtocolError, JSON_RPC_ERROR_CODES } from "@mcp-ts/bridge-protocol";
import { getMcpManager } from "./mcp-core-tools";
import { buildRemoteCatalogFromClients } from "./remote-catalog";

/**
 * Builds a fresh remote catalog snapshot for the given user.
 *
 * @param userId - The authenticated user ID.
 * @returns The complete remote catalog snapshot.
 */
export async function buildRemoteCatalog(userId: string): Promise<CatalogSnapshot> {
  const manager = await getMcpManager(userId, { publishOnConnect: false });
  return buildRemoteCatalogFromClients(manager.getClients());
}

/**
 * Executes a remote tool call directly against the target upstream MCP client.
 *
 * Eliminates redundant pre-flight `listTools()` round-trips to achieve minimal invocation latency.
 *
 * @param userId - The authenticated user ID.
 * @param call - The tool call parameters including serverId, toolName, and arguments.
 * @returns The tool execution result from the upstream MCP server.
 */
export async function callRemoteTool(userId: string, call: ToolCallParams): Promise<unknown> {
  const manager = await getMcpManager(userId, { publishOnConnect: false });
  const client = manager
    .getClients()
    .find((candidate) =>
      [candidate.getServerId?.(), candidate.getServerName?.()].includes(call.serverId),
    );
  if (!client) {
    throw new BridgeProtocolError(
      JSON_RPC_ERROR_CODES.serverUnavailable,
      `Remote server "${call.serverId}" is unavailable`,
    );
  }
  return client.callTool(call.toolName, call.arguments);
}
