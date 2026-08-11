import type { IndexedTool, ToolDefinition, ToolSearchResult, ToolServer } from "../types.js";

/**
 * Normalizes a server ID to a safe, lowercase identifier.
 */
export function normalizeServerId(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "") || "server";
}

/**
 * Default per-server timeout for `listTools` during indexing.
 * Prevents a single slow or unreachable server from blocking the whole index.
 */
export const DEFAULT_LIST_TOOLS_TIMEOUT_MS = 15_000;

/**
 * Races a promise against a timeout so a hung call cannot block the caller.
 * The underlying promise is not cancelled; it is simply no longer awaited.
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timed out after ${timeoutMs}ms listing tools for server "${label}".`));
    }, timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * Indexes all tools from the given servers.
 * Resolves tools from each server and flattens into a single list.
 * Each server's `listTools` is isolated: a per-server timeout and a failure
 * only skip that server (with a warning) instead of failing the entire index.
 */
export async function indexServers(
  servers: ToolServer[],
  options: { listToolsTimeoutMs?: number } = {},
): Promise<IndexedTool[]> {
  const indexed: IndexedTool[] = [];
  const seenServerIds = new Set<string>();
  const listToolsTimeoutMs = options.listToolsTimeoutMs ?? DEFAULT_LIST_TOOLS_TIMEOUT_MS;

  for (const server of servers) {
    const serverId = normalizeServerId(server.serverId);
    if (seenServerIds.has(serverId)) {
      throw new Error(`Duplicate tool server id "${serverId}".`);
    }
    seenServerIds.add(serverId);

    let listed: { tools: ToolDefinition[] };
    try {
      listed = await withTimeout(server.listTools(), listToolsTimeoutMs, server.serverId);
    } catch (error) {
      console.warn(
        `[code-mode] Skipping server "${server.serverId}": failed to list tools: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      continue;
    }

    for (const tool of listed.tools) {
      indexed.push({
        serverId,
        serverName: server.serverName ?? serverId,
        toolName: tool.name,
        description: tool.description ?? "",
        inputSchema: tool.inputSchema,
        annotations: tool.annotations,
      });
    }
  }

  return indexed;
}

function scoreTool(tool: IndexedTool, query: string): number {
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);

  if (terms.length === 0) return 1;

  const name = tool.toolName.toLowerCase();
  const server = `${tool.serverId} ${tool.serverName}`.toLowerCase();
  const description = tool.description.toLowerCase();
  let score = 0;

  for (const term of terms) {
    if (name === term) score += 10;
    if (name.includes(term)) score += 6;
    if (server.includes(term)) score += 4;
    if (description.includes(term)) score += 2;
  }

  return score;
}

export function searchToolIndex(
  index: IndexedTool[],
  query?: string,
  limit = 10,
  serverId?: string,
): ToolSearchResult[] {
  return index
    .filter((tool) => {
      if (serverId && tool.serverId !== serverId) return false;
      return true;
    })
    .map((tool) => ({ tool, score: scoreTool(tool, query ?? "") }))
    .filter((entry) => !query || entry.score > 0)
    .sort((a, b) => b.score - a.score || a.tool.toolName.localeCompare(b.tool.toolName))
    .slice(0, Math.min(limit, 100))
    .map(({ tool, score }) => ({
      serverId: tool.serverId,
      serverName: tool.serverName,
      toolName: tool.toolName,
      description: tool.description,
      annotations: tool.annotations,
      score,
    }));
}

/**
 * Resolves a specific tool from the index by serverId + toolName.
 */
export function resolveTool(
  index: IndexedTool[],
  toolName: string,
  serverId?: string,
): IndexedTool | undefined {
  const matches = index.filter((tool) => {
    if (tool.toolName !== toolName) return false;
    if (serverId && tool.serverId !== normalizeServerId(serverId)) return false;
    return true;
  });

  if (matches.length > 1) {
    const servers = matches.map((t) => t.serverId).join(", ");
    throw new Error(
      `Tool "${toolName}" exists on multiple servers: ${servers}. Provide serverId.`
    );
  }

  return matches[0];
}

/**
 * Lists connected servers with tool counts.
 */
export function listServersFromIndex(
  index: IndexedTool[],
): Array<{ serverId: string; serverName: string; toolCount: number }> {
  const counts = new Map<string, { serverId: string; serverName: string; toolCount: number }>();

  for (const tool of index) {
    const current =
      counts.get(tool.serverId) ??
      { serverId: tool.serverId, serverName: tool.serverName, toolCount: 0 };
    current.toolCount += 1;
    counts.set(tool.serverId, current);
  }

  return [...counts.values()];
}
