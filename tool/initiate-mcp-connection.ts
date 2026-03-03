import { tool } from 'ai';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getActiveMcpConnections } from '@/lib/mcp-connections';

export const initiateMcpConnection = tool({
  description: 'Initiate an MCP connection to a specified server',
  inputSchema: z.object({
    serverName: z.string().describe('Name of the MCP server'),
    serverUrl: z.string().describe('URL of the MCP server'),
    serverId: z.string().describe('Unique identifier for the server'),
    transportType: z.enum(['sse', 'streamable_http']).describe('Transport type for MCP connection'),
  }),
  needsApproval: true, // Require user approval
  async *execute({ serverName, serverUrl, serverId, transportType }) {
    yield { state: 'loading' as const };

    try {
      console.log('[initiateMcpConnection] Tool approved, verifying connection');

      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user?.id) {
        yield {
          state: 'ready' as const,
          success: false,
          error: 'Unauthorized',
          message: 'Please sign in to connect MCP servers.',
        };
        return;
      }

      const connections = await getActiveMcpConnections(user.id);
      const connection = connections.find((conn) => conn.serverUrl === serverUrl);

      if (connection && connection.active) {
        console.log('[initiateMcpConnection] Connection verified');
        yield {
          state: 'ready' as const,
          success: true,
          sessionId: connection.sessionId,
          message: `Successfully connected to ${serverName}`,
        };
      } else {
        console.warn('[initiateMcpConnection] Connection not found or inactive');
        yield {
          state: 'ready' as const,
          success: false,
          error: 'Connection not found',
          message: `Connection to ${serverName} was not established. Please try again.`,
        };
      }
    } catch (error) {
      console.error('[initiateMcpConnection] Exception caught:', {
        error,
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });
      yield {
        state: 'ready' as const,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        message: `Error connecting to ${serverName}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },
});
