import type {
  CatalogSnapshot,
  McpServerDescriptor,
} from "@mcp-ts/bridge-protocol";

type CatalogClient = {
  getServerId?(): string | undefined;
  getServerName?(): string | undefined;
  listTools(): Promise<{ tools?: Array<Record<string, unknown> & { name: string }> }>;
};

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function buildRemoteCatalogFromClients(
  clients: CatalogClient[],
): Promise<CatalogSnapshot> {
  const servers: McpServerDescriptor[] = [];
  for (const client of clients) {
    const serverId = client.getServerId?.() ?? client.getServerName?.();
    if (!serverId) continue;
    let listed: Awaited<ReturnType<CatalogClient["listTools"]>> = { tools: [] };
    try {
      listed = await client.listTools();
    } catch {
      // Keep the server in the complete snapshot even when tool listing is temporarily unavailable.
    }
    servers.push({
      serverId,
      serverName: client.getServerName?.() ?? serverId,
      tools: (listed.tools ?? []).map((tool) => ({
        name: tool.name,
        ...(typeof tool.description === "string" ? { description: tool.description } : {}),
        inputSchema: asObject(tool.inputSchema),
        ...(tool.outputSchema ? { outputSchema: asObject(tool.outputSchema) } : {}),
        ...(tool.annotations ? { annotations: tool.annotations } : {}),
      })),
    });
  }
  servers.sort((a, b) => a.serverId.localeCompare(b.serverId));
  return { servers };
}
