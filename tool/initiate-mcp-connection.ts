import { tool } from 'ai';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getMcpConnectionsForIdentity } from '@/lib/mcp-connections';
import { normalizeServerUrl } from '@/lib/url';

export const initiateMcpConnection = tool({
  description: 'Initiate an MCP connection to a specified server to connect and verify the connection status.',
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
          state: 'output-error' as const,
          success: false,
          error: 'Unauthorized',
          message: 'Please sign in to connect MCP servers.',
        };
        return;
      }

      const normalizedTargetUrl = normalizeServerUrl(serverUrl);
      const connections = await getMcpConnectionsForIdentity(user.id);
      const connection = connections.find(
        (conn) => normalizeServerUrl(conn.serverUrl) === normalizedTargetUrl
      );

      if (connection && connection.active) {
        console.log('[initiateMcpConnection] Connection verified');
        yield {
          state: 'output-available' as const,
          success: true,
          sessionId: connection.sessionId,
          connectionState: 'ready' as const,
          message: `${serverName} is connected and ready to use.`,
        };
      } else if (connection) {
        yield {
          state: 'output-available' as const,
          success: false,
          sessionId: connection.sessionId,
          connectionState: 'authorization_pending' as const,
          message: `${serverName} connection exists but is not ready yet. Complete OAuth authorization in the popup, then try again.`,
        };
      } else {
        console.warn('[initiateMcpConnection] Connection not found or inactive');
        yield {
          state: 'output-error' as const,
          success: false,
          error: 'Connection not found',
          connectionState: 'failed' as const,
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
        state: 'output-error' as const,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        connectionState: 'failed' as const,
        message: `Error connecting to ${serverName}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },
});
