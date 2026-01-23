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
  // Extract user ID from request
  getUserId: (request) => {
    return new URL(request.url).searchParams.get('userId');
  },

  // Optional: Custom authentication
  authenticate: async (userId, token) => {
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

export function McpConnections({ userId }: { userId: string }) {
  const {
    connections,
    status,
    connect,
    disconnect,
    callTool,
  } = useMcp({
    url: `/api/mcp?userId=${userId}`,
    userId,
    autoConnect: true,
  });

  const handleConnect = async () => {
    await connect({
      serverId: 'my-server',
      serverName: 'My MCP Server',
      serverUrl: 'https://mcp.example.com',
      callbackUrl: window.location.origin + '/oauth/callback',
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
  // Get user ID from your auth system
  const userId = 'user-123'; // Replace with actual user ID

  return (
    <main>
      <h1>My App</h1>
      <McpConnections userId={userId} />
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
  const userId = req.query.userId as string;

  if (!userId) {
    return res.status(400).json({ error: 'userId required' });
  }

  const sseHandler = createSSEHandler({
    userId,
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
  const userId = 'user-123';

  return (
    <div>
      <h1>My App</h1>
      <McpConnections userId={userId} />
    </div>
  );
}
```

## OAuth Callback Handler

Handle OAuth callbacks at `app/oauth/callback/page.tsx`:

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
    userId: 'user-123',
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
  getUserId: (request) => {
    const userId = new URL(request.url).searchParams.get('userId');
    if (!userId) throw new Error('userId required');
    return userId;
  },
});
```

```typescript title="components/McpClient.tsx"
'use client';

import { useMcp } from '@mcp-ts/redis/client';
import { useState } from 'react';

export function McpClient({ userId }: { userId: string }) {
  const { connections, connect, callTool, status } = useMcp({
    url: `/api/mcp?userId=${userId}`,
    userId,
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
