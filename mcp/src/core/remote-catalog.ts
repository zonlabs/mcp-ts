/**
 * @file mcp/src/core/remote-catalog.ts
 * @description Aggregates and normalizes remote MCP server tool catalogs concurrently.
 */

import type {
  CatalogSnapshot,
  McpServerDescriptor,
} from "@mcp-ts/bridge-protocol";

/**
 * Minimal MCP client interface required for building a remote catalog descriptor.
 */
export type CatalogClient = {
  /**
   * Retrieves the unique identifier of the remote server.
   */
  getServerId?(): string | undefined;

  /**
   * Retrieves the display name of the remote server.
   */
  getServerName?(): string | undefined;

  /**
   * Fetches the tool listing from the upstream MCP server.
   */
  listTools(): Promise<{ tools?: Array<Record<string, unknown> & { name: string }> }>;
};

/**
 * Helper to safely extract a non-null object record, falling back to an empty object.
 *
 * @param value - The input value to validate.
 * @returns A guaranteed key-value object record.
 */
function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * Maximum duration in milliseconds allowed for an individual upstream MCP server
 * to return its tool listing before timing out. Prevents a single hanging server
 * from blocking the entire remote catalog handshake.
 */
export const DEFAULT_TOOL_LIST_TIMEOUT_MS = 7_000;

/**
 * Wraps a promise with a timeout ceiling, rejecting if the operation exceeds the deadline.
 *
 * @template T - The resolved value type of the promise.
 * @param promise - The promise to guard with a timeout.
 * @param timeoutMs - Maximum execution time in milliseconds (defaults to 7,000ms).
 * @returns A promise resolving to the target value or rejecting on timeout.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs = DEFAULT_TOOL_LIST_TIMEOUT_MS,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Timeout listing tools")), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Builds a normalized, aggregate catalog snapshot from multiple upstream MCP clients in parallel.
 *
 * Each client's `listTools` call is executed concurrently with `Promise.allSettled()` and guarded
 * by `withTimeout()`. If a server fails or times out, it remains in the descriptor snapshot with
 * an empty tool list rather than failing the entire catalog build.
 *
 * @param clients - List of initialized upstream MCP catalog clients.
 * @returns A sorted CatalogSnapshot containing server descriptors and normalized tool schemas.
 */
export async function buildRemoteCatalogFromClients(
  clients: CatalogClient[],
): Promise<CatalogSnapshot> {
  const validClients = clients.filter(
    (client) => Boolean(client.getServerId?.() ?? client.getServerName?.()),
  );

  const results = await Promise.allSettled(
    validClients.map(async (client) => {
      const serverId = client.getServerId?.() ?? client.getServerName?.() ?? "";
      let listed: Awaited<ReturnType<CatalogClient["listTools"]>> = { tools: [] };
      try {
        listed = await withTimeout(client.listTools());
      } catch {
        // Keep the server in the complete snapshot even when tool listing is temporarily unavailable.
      }
      return {
        serverId,
        serverName: client.getServerName?.() ?? serverId,
        tools: (listed.tools ?? []).map((tool) => ({
          name: tool.name,
          ...(typeof tool.description === "string" ? { description: tool.description } : {}),
          inputSchema: asObject(tool.inputSchema),
          ...(tool.outputSchema ? { outputSchema: asObject(tool.outputSchema) } : {}),
          ...(tool.annotations ? { annotations: tool.annotations } : {}),
        })),
      };
    }),
  );

  const servers: McpServerDescriptor[] = [];
  for (const res of results) {
    if (res.status === "fulfilled") {
      servers.push(res.value);
    }
  }
  servers.sort((a, b) => a.serverId.localeCompare(b.serverId));
  return { servers };
}
