import { UIToolInvocation, tool } from 'ai';
import { z } from 'zod';
import { createPublicSupabaseClient } from '@/lib/supabase/public-client';
import { listMcpServersCatalog } from '@/lib/mcp-servers/service';
import { restMcpServer } from '@/lib/mcp-servers/rest-serialize';

export const searchMcpServers = tool({
  description: `Search for MCP servers in the registry by analyzing user intent and finding relevant capabilities.

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
    searchQuery: z.string().optional().describe('Name of the MCP server to find e.g. Exa, Github, Deepwiki etc. or core capability or action keyword(s) extracted from user intent.'),
    first: z.number().optional().default(10).describe('Number of results to return (default: 10)'),
    after: z.string().optional().describe('Cursor for pagination'),
  }),
  async *execute({ searchQuery, first, after }) {
    yield { state: 'loading' as const };

    try {
      const supabase = createPublicSupabaseClient();
      const conn = await listMcpServersCatalog(supabase, {
        first: first || 10,
        after: after || null,
        search: searchQuery || null,
        publicOnly: true,
        orderField: 'created_at',
        orderAscending: false,
      });

      const textOnlyServers = conn.edges.map((edge) => ({
        ...restMcpServer(edge.node),
        matchType: 'text' as const,
      }));

      yield {
        state: 'output-available' as const,
        success: true,
        servers: textOnlyServers,
        semanticResults: [] as unknown[],
        count: textOnlyServers.length,
        semanticCount: 0,
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
