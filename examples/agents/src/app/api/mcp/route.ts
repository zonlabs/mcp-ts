import { createNextMcpHandler } from '@mcp-ts/sdk/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const { GET, POST } = createNextMcpHandler({
  clientDefaults: {
    clientName: 'agents-example',
  },
});
