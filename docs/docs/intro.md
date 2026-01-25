---
sidebar_position: 1
slug: /
---

import { DocIcon } from '@site/src/components/DocIcons';

# Getting Started

**mcp-ts** is a lightweight MCP (Model Context Protocol) client library for JavaScript applications. It provides seamless integration for both server-side and client-side MCP connections with real-time updates.

## Why mcp-ts?

1. **Simple API** — Easy-to-use methods for connecting to MCP servers
2. **React Ready** — Built-in React hook for effortless integration
3. **Real-Time & Observability** — Live updates and connection observability via Server-Sent Events (SSE)
4. **Persistent Sessions** — Automatic session management and recovery
5. **TypeScript** — Full type safety with TypeScript support
6. **Production Ready** — Works in serverless environments
7. **Flexible Storage** — Multiple backend options:
   - <DocIcon type="redis" size={20} /> **Redis** — Production distributed storage
   - <DocIcon type="filesystem" size={20} /> **File System** — Local JSON persistence
   - <DocIcon type="memory" size={20} /> **In-Memory** — Fast ephemeral storage
   - <DocIcon type="postgres" size={20} /> **PostgreSQL** — Coming soon!

## What You'll Need

- [Node.js](https://nodejs.org/) version 18.0 or above
- **Storage Backend** (choose one):
  - <DocIcon type="redis" size={18} /> [Redis](https://redis.io/) - Recommended for production
  - <DocIcon type="filesystem" size={18} /> File System - Built-in, great for local development
  - <DocIcon type="memory" size={18} /> In-Memory - Built-in, default for quick testing
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
  getIdentity: (request) => {
    return new URL(request.url).searchParams.get('identity');
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
    identity: 'user-123',
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
- **[Storage Backends](./storage-backends.md)** - Choose your storage backend
- **[Next.js Integration](./nextjs.md)** - Complete Next.js example
- **[React Hook](./react-hook.md)** - Using the useMcp hook
- **[API Reference](./api-reference.md)** - Full API documentation
