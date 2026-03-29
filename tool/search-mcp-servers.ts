import { UIToolInvocation, tool } from 'ai';
import { z } from 'zod';
import { SEARCH_MCP_SERVERS_QUERY } from '@/lib/graphql';
import { findRelevantContent } from '@/lib/ai/embedding';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000';
const GRAPHQL_ENDPOINT = `${BACKEND_URL}/api/graphql`;

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
      let embeddingResults: any[] = [];
      let allTextResults: any[] = [];

      // 1. Semantic search using embeddings (if query provided) - COMMENTED OUT due to API key issues
      /*
      if (searchQuery) {
        try {
          const embeddings = await findRelevantContent(
            searchQuery,
            'mcp_server_embeddings',
            0.35, // similarity threshold
            first || 10
          );

          embeddingResults = embeddings.map((emb: any) => ({
            id: emb.server_id,
            name: emb.server_name,
            url: emb.server_url,
            description: emb.description,
            transport: emb.transport,
            similarity: emb.similarity,
            matchType: 'semantic'
          }));
        } catch (embError) {
          console.error('[Search] Embedding search failed:', embError);
        }
      }
      */

      // 2. Text-based GraphQL search across name OR description
      // Uses custom 'search' parameter that searches both fields with OR logic
      const response = await fetch(GRAPHQL_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: SEARCH_MCP_SERVERS_QUERY,
          variables: {
            first: first || 10,
            after: after || null,
            filters: null,
            search: searchQuery || null,
          },
        }),
      });

      const data = await response.json();

      if (data.data?.mcpServers) {
        allTextResults = data.data.mcpServers.edges.map((edge: any) => edge.node);
      }

      if (response.ok && data.data?.mcpServers) {
        const pageInfo = data.data.mcpServers.pageInfo;

        // 3. Semantic results have full server metadata from embeddings - COMMENTED OUT
        /*
        const uniqueSemanticServers = embeddingResults.reduce((acc: any[], curr: any) => {
          const existing = acc.find(s => s.id === curr.id);
          if (!existing || curr.similarity > existing.similarity) {
            if (existing) {
              const index = acc.indexOf(existing);
              acc[index] = curr;
            } else {
              acc.push(curr);
            }
          }
          return acc;
        }, []).sort((a: any, b: any) => b.similarity - a.similarity);
        */
        const uniqueSemanticServers: any[] = [];

        const textOnlyServers = allTextResults
          .map((server: any) => ({
            ...server,
            matchType: 'text'
          }));

        yield {
          state: 'output-available' as const,
          success: true,
          servers: textOnlyServers, 
          semanticResults: uniqueSemanticServers,
          count: textOnlyServers.length + uniqueSemanticServers.length,
          semanticCount: uniqueSemanticServers.length,
          hasNextPage: pageInfo.hasNextPage,
          endCursor: pageInfo.endCursor,
          message: `Found ${textOnlyServers.length} server${textOnlyServers.length !== 1 ? 's' : ''}${searchQuery ? ` matching "${searchQuery}"` : ''}`,
        };
      } else if (data.errors) {
        yield {
          state: 'output-error' as const,
          success: false,
          error: data.errors[0]?.message || 'GraphQL error',
          message: `Error: ${data.errors[0]?.message || 'GraphQL error'}`,
        };
      } else {
        yield {
          state: 'output-error' as const,
          success: false,
          error: 'Failed to search servers',
          message: 'Failed to search servers',
        };
      }
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
