import type {
  CatalogSnapshot,
  ToolCallParams,
} from "@mcp-ts/bridge-protocol";
import { BridgeProtocolError, JSON_RPC_ERROR_CODES } from "@mcp-ts/bridge-protocol";
import { getMcpManager } from "./mcp-core-tools";
import { buildRemoteCatalogFromClients } from "./remote-catalog";

export async function buildRemoteCatalog(userId: string): Promise<CatalogSnapshot> {
  const manager = await getMcpManager(userId);
  return buildRemoteCatalogFromClients(manager.getClients());
}

export async function callRemoteTool(userId: string, call: ToolCallParams): Promise<unknown> {
  const manager = await getMcpManager(userId);
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
  const tools = await client.listTools();
  if (!(tools.tools ?? []).some((tool) => tool.name === call.toolName)) {
    throw new BridgeProtocolError(
      JSON_RPC_ERROR_CODES.toolNotFound,
      `Remote server "${call.serverId}" has no tool "${call.toolName}"`,
    );
  }
  return client.callTool(call.toolName, call.arguments);
}
