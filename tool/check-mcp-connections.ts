import { UIToolInvocation, tool } from 'ai';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getActiveMcpConnections } from '@/lib/mcp-connections';

export const checkMcpConnections = tool({
  description: 'Check which MCP servers are currently connected and available to use. Returns list of active connections with their available tools.',
  inputSchema: z.object({}),
  async *execute() {
    yield { state: 'loading' as const };

    try {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user?.id) {
        yield {
          state: 'ready' as const,
          success: false,
          error: 'Unauthorized',
          message: 'Please sign in to check MCP connections.',
        };
        return;
      }

      const connections = await getActiveMcpConnections(user.id);
      yield {
        state: 'ready' as const,
        success: true,
        connections,
        count: connections.length,
        message: `Found ${connections.length} active MCP connection(s)`,
      };
    } catch (error) {
      console.error('[checkMcpConnectionsTool] Exception caught:', {
        error,
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });
      yield {
        state: 'ready' as const,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        message: `Error checking connections: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },
});

export type CheckMcpConnectionsToolInvocation = UIToolInvocation<
  typeof checkMcpConnections
>;
