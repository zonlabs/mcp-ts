import { createNextMcpHandler } from '@mcp-ts/client/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const { GET, POST } = createNextMcpHandler({
  clientDefaults: {
    clientName: 'agents-example',
  },
});
