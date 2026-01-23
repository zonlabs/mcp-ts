---
sidebar_position: 1
slug: /
---

# Getting Started

**mcp-ts** is a lightweight MCP (Model Context Protocol) client library for JavaScript applications. It provides seamless integration for both server-side and client-side MCP connections with real-time updates.

## Why mcp-ts?

- **🎯 Simple API** - Easy-to-use methods for connecting to MCP servers
- **⚛️ React Ready** - Built-in React hook for effortless integration
- **⚡ Real-Time** - Live updates via Server-Sent Events (SSE)
- **🔄 Persistent Sessions** - Automatic session management and recovery
- **📦 TypeScript** - Full type safety with TypeScript support
- **🚀 Production Ready** - Works in serverless environments like Vercel

## What You'll Need

- [Node.js](https://nodejs.org/) version 18.0 or above
- [Redis](https://redis.io/) instance (local or cloud)
- Basic knowledge of JavaScript/TypeScript

## Quick Install

```bash
npm install @mcp-ts/redis
```

## Basic Example

### Server-Side (Next.js API Route)

```typescript
// app/api/mcp/route.ts
import { createNextMcpHandler } from '@mcp-ts/redis/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const { GET, POST } = createNextMcpHandler({
  getUserId: (request) => {
    return new URL(request.url).searchParams.get('userId');
  },
});
```

### Client-Side (React)

```typescript
'use client';
import { useMcp } from '@mcp-ts/redis/client';

function App() {
  const { connections, connect, status } = useMcp({
    url: '/api/mcp',
    userId: 'user-123',
  });

  return (
    <div>
      <p>Status: {status}</p>
      <button onClick={() => connect({
        serverId: 'my-server',
        serverName: 'My MCP Server',
        serverUrl: 'https://mcp.example.com',
        callbackUrl: window.location.origin + '/callback',
      })}>
        Connect
      </button>

      {connections.map(conn => (
        <div key={conn.sessionId}>
          <h3>{conn.serverName}</h3>
          <p>State: {conn.state}</p>
          <p>Tools: {conn.tools.length}</p>
        </div>
      ))}
    </div>
  );
}
```

## Next Steps

Get started with these guides:

- **[Installation](./installation.md)** - Detailed setup instructions
- **[Next.js Integration](./nextjs.md)** - Complete Next.js example
- **[React Hook](./react-hook.md)** - Using the useMcp hook
- **[API Reference](./api-reference.md)** - Full API documentation
