import { UIToolInvocation, tool } from 'ai';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createPublicSupabaseClient } from '@/lib/supabase/public-client';
import { getStoredMcpConnectionsForIdentity, type McpConnectionRecord } from '@/lib/mcp-connections';
import { listMcpServersCatalog } from '@/lib/mcp-servers/service';
import { restMcpServer } from '@/lib/mcp-servers/rest-serialize';
import { normalizeServerUrl } from '@/lib/url';
import type { McpServer } from '@/types/mcp';

type McpServerSearchResult = McpServer & {
  activeConnection?: McpConnectionRecord | null;
  activeConnections?: McpConnectionRecord[];
};

function findConnectionsForServer(
  server: McpServer,
  connections: McpConnectionRecord[]
): McpConnectionRecord[] {
  const serverUrl = normalizeServerUrl(server.url);

  return connections.filter((connection) => {
    if (connection.serverId && connection.serverId === server.id) return true;
    const connectionUrl = normalizeServerUrl(connection.serverUrl);
    return Boolean(serverUrl && connectionUrl && connectionUrl === serverUrl);
  });
}

async function getUserMcpConnections(): Promise<McpConnectionRecord[]> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user?.id) return [];
    return getStoredMcpConnectionsForIdentity(user.id);
  } catch (error) {
    console.error('[searchMcpServers] Failed to load stored user connections:', error);
    return [];
  }
}

export const searchMcpServers = tool({
  description: `Search for MCP servers by analyzing user intent and finding relevant capabilities. Matches both server name and description text in the catalog.

**CRITICAL - Intent Analysis Required:**
detect an specific MCP server name that the user want to use or connect to, you can use that directly.
When the user asks for a task, you MUST extract the core capability/action needed, NOT the full user request.

Examples of CORRECT intent analysis:

User Request → Extract Capability
- "search for papers on LLM optimization" → "research papers" OR "arxiv"
- "search the web for latest AI news" → "web search"
- "use XYZ MCP for xyz task" → "XYZ MCP"
- "interact with GitHub repos" → "github"
- "send email to xyz@example.com" → "email gmail outlook"
- "use Supabase to manage my database" → "supabase"
`,
  inputSchema: z.object({
    searchQuery: z.string().optional().describe('Terms to match against server name and description in the catalog (case-insensitive). E.g. Github, email, railway.'),
    first: z.number().optional().default(10).describe('Number of results to return (default: 10)'),
    after: z.string().optional().describe('Cursor for pagination'),
  }),
  async *execute({ searchQuery, first, after }) {
    yield { state: 'loading' as const };

    try {
      const supabase = createPublicSupabaseClient();
      const [conn, connections] = await Promise.all([
        listMcpServersCatalog(supabase, {
          first: first || 10,
          after: after || null,
          search: searchQuery || null,
          searchInDescription: true,
          publicOnly: true,
          orderField: 'created_at',
          orderAscending: false,
        }),
        getUserMcpConnections(),
      ]);

      const textOnlyServers: McpServerSearchResult[] = conn.edges.map((edge) => {
        const server = restMcpServer(edge.node);
        const serverConnections = findConnectionsForServer(server, connections);
        const activeConnections = serverConnections.filter((connection) => connection.active);
        const activeConnection = activeConnections[0] ?? null;

        return {
          ...server,
          matchType: 'text' as const,
          connectionStatus: activeConnection?.connectionStatus ?? server.connectionStatus,
          activeConnection,
          activeConnections,
        };
      });
      const connectedServers = connections.filter((connection) => connection.active);

      yield {
        state: 'output-available' as const,
        success: true,
        servers: textOnlyServers,
        connectedServers,
        count: textOnlyServers.length,
        connectedCount: connectedServers.length,
        hasNextPage: conn.pageInfo.hasNextPage,
        endCursor: conn.pageInfo.endCursor,
        message: `Found ${textOnlyServers.length} server${textOnlyServers.length !== 1 ? 's' : ''}${searchQuery ? ` matching "${searchQuery}"` : ''}`,
      };
    } catch (error) {
      yield {
        state: 'output-error' as const,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        message: `Error searching servers: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },
});

export type SearchMcpServersToolInvocation = UIToolInvocation<
  typeof searchMcpServers
>;
