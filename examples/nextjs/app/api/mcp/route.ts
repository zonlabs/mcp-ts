import { createNextMcpHandler } from '@mcp-ts/sdk/server';

/**
 * MCP SSE endpoint
 * Handles real-time MCP connections with OAuth 2.1 authentication
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const { GET, POST } = createNextMcpHandler({

  clientDefaults: {
    clientName: 'nextjs',
  },
  // Optional: customize how to extract identity and auth token
  // getIdentity: (request) => new URL(request.url).searchParams.get('identity'),
  // getAuthToken: (request) => request.headers.get('authorization'),

  // Optional: add custom authentication
  // validateAuth: async (identity, token) => {
  //   // Verify token with your auth system
  //   return token !== null;
  // },
});
