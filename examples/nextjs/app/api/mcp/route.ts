import { createNextMcpHandler } from '@mcp-assistant/mcp-redis/server';

/**
 * MCP SSE endpoint
 * Handles real-time MCP connections with OAuth 2.0 authentication
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const { GET, POST } = createNextMcpHandler({
  // Optional: customize how to extract userId and auth token
  // getUserId: (request) => new URL(request.url).searchParams.get('userId'),
  // getAuthToken: (request) => request.headers.get('authorization'),

  // Optional: add custom authentication
  // validateAuth: async (userId, token) => {
  //   // Verify token with your auth system
  //   return token !== null;
  // },
});
