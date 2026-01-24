---
sidebar_position: 3
---

# Next.js Integration

Complete guide for integrating mcp-ts with Next.js applications (App Router and Pages Router).

## App Router (Recommended)

### Step 1: Create API Route

Create an API route handler at `app/api/mcp/route.ts`:

```typescript
import { createNextMcpHandler } from '@mcp-ts/redis/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const { GET, POST } = createNextMcpHandler({
  // Extract identity from request
  getIdentity: (request) => {
    return new URL(request.url).searchParams.get('identity');
  },

  // Optional: Custom authentication
  authenticate: async (identity, token) => {
    // Verify token with your auth system
    return true; // or throw error if invalid
  },

  // Optional: Heartbeat interval
  heartbeatInterval: 30000, // 30 seconds
});
```

### Step 2: Create Client Component

Create a component at `components/McpConnections.tsx`:

```typescript
'use client';

import { useMcp } from '@mcp-ts/redis/client';

export function McpConnections({ identity }: { identity: string }) {
  const {
    connections,
    status,
    connect,
    disconnect,
    callTool,
  } = useMcp({
    url: `/api/mcp?identity=${identity}`,
    identity,
    autoConnect: true,
  });

  const handleConnect = async () => {
    await connect({
      serverId: 'my-server',
      serverName: 'My MCP Server',
      serverUrl: 'https://mcp.example.com',
      callbackUrl: window.location.origin + '/api/mcp/callback',
    });
  };

  return (
    <div>
      <div>
        <h2>MCP Connections</h2>
        <p>Status: <strong>{status}</strong></p>
        <button onClick={handleConnect}>
          Connect to Server
        </button>
      </div>

      {connections.map((conn) => (
        <div key={conn.sessionId}>
          <h3>{conn.serverName}</h3>
          <p>State: {conn.state}</p>
          <p>Available Tools: {conn.tools.length}</p>

          {conn.state === 'CONNECTED' && (
            <div>
              {conn.tools.map((tool) => (
                <button
                  key={tool.name}
                  onClick={() => callTool(conn.sessionId, tool.name, {})}
                >
                  {tool.name}
                </button>
              ))}
              <button onClick={() => disconnect(conn.sessionId)}>
                Disconnect
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
```

### Step 3: Use in Page

Use the component in your page at `app/page.tsx`:

```typescript
import { McpConnections } from '@/components/McpConnections';

export default function Home() {
  // Get identity from your auth system
  const identity = 'user-123'; // Replace with actual identity

  return (
    <main>
      <h1>My App</h1>
      <McpConnections identity={identity} />
    </main>
  );
}
```

## Pages Router

### Step 1: Create API Route

Create `pages/api/mcp/sse.ts`:

```typescript
import { createSSEHandler } from '@mcp-ts/redis/server';
import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const identity = req.query.identity as string;

  if (!identity) {
    return res.status(400).json({ error: 'identity required' });
  }

  const sseHandler = createSSEHandler({
    identity,
    heartbeatInterval: 30000,
  });

  return sseHandler(req, res);
}
```

### Step 2: Create Component

Same as App Router component above.

### Step 3: Use in Page

```typescript
import { McpConnections } from '@/components/McpConnections';

export default function Home() {
  const identity = 'user-123';

  return (
    <div>
      <h1>My App</h1>
      <McpConnections identity={identity} />
    </div>
  );
}
```

## OAuth Callback Handler

Handle OAuth callbacks at `app/oauth/callback-popup/page.tsx` (for popups) or `app/oauth/callback/page.tsx` (for redirects):

```typescript
'use client';

import { useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useMcp } from '@mcp-ts/redis/client';

export default function OAuthCallback() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { finishAuth } = useMcp({
    url: '/api/mcp',
    identity: 'user-123',
  });

  useEffect(() => {
    const code = searchParams.get('code');
    const state = searchParams.get('state');

    if (code && state) {
      finishAuth(code, state)
        .then(() => {
          router.push('/'); // Redirect back to main page
        })
        .catch((error) => {
          console.error('OAuth failed:', error);
        });
    }
  }, [searchParams, finishAuth, router]);

  return <div>Completing authentication...</div>;
}
```

## Environment Variables

Add to `.env.local`:

```bash
# Redis connection
REDIS_URL=redis://localhost:6379

# Or for Upstash Redis
REDIS_URL=rediss://default:password@host.upstash.io:6379
```

## Production Deployment

### Vercel

1. **Add environment variable** in Vercel dashboard:
   - `REDIS_URL` - Your Redis connection string

2. **Deploy**:
```bash
vercel deploy
```

### Other Platforms

Ensure your platform supports:
- Node.js runtime (for API routes)
- Environment variables
- WebSocket/SSE connections

## Complete Example

Here's a full working example:

```typescript title="app/api/mcp/route.ts"
import { createNextMcpHandler } from '@mcp-ts/redis/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const { GET, POST } = createNextMcpHandler({
  getIdentity: (request) => {
    const identity = new URL(request.url).searchParams.get('identity');
    if (!identity) throw new Error('identity required');
    return identity;
  },
});
```

```typescript title="components/McpClient.tsx"
'use client';

import { useMcp } from '@mcp-ts/redis/client';
import { useState } from 'react';

export function McpClient({ identity }: { identity: string }) {
  const { connections, connect, callTool, status } = useMcp({
    url: `/api/mcp?identity=${identity}`,
    identity,
    autoConnect: true,
  });

  const [result, setResult] = useState<any>(null);

  const handleToolCall = async (sessionId: string, toolName: string) => {
    try {
      const res = await callTool(sessionId, toolName, {});
      setResult(res);
    } catch (error) {
      console.error('Tool call failed:', error);
    }
  };

  return (
    <div>
      <h2>MCP Client ({status})</h2>

      {connections.map(conn => (
        <div key={conn.sessionId}>
          <h3>{conn.serverName}</h3>
          <p>{conn.state}</p>

          {conn.tools.map(tool => (
            <button
              key={tool.name}
              onClick={() => handleToolCall(conn.sessionId, tool.name)}
            >
              {tool.name}
            </button>
          ))}
        </div>
      ))}

      {result && (
        <pre>{JSON.stringify(result, null, 2)}</pre>
      )}
    </div>
  );
}
```

## Next Steps

- [React Hook API](./react-hook.md) - Detailed hook documentation
- [API Reference](./api-reference.md) - Complete API reference
- [Examples](https://github.com/ashen-dusk/mcp-ts/tree/main/examples) - More code examples
