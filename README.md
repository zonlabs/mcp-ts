# @mcp-ts/redis

Lightweight MCP (Model Context Protocol) client library for JavaScript applications with Redis-backed session management and real-time SSE support.

[![npm version](https://badge.fury.io/js/@mcp-ts%2Fredis.svg)](https://www.npmjs.com/package/@mcp-ts/redis)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- **🔄 Real-Time SSE** - Server-Sent Events for live connection updates
- **📦 Redis Sessions** - Stateless session management with automatic TTL
- **⚡ Serverless-Ready** - Works in serverless environments (Vercel, AWS Lambda, etc.)
- **⚛️ React Hook** - `useMcp` hook for easy React integration
- **🛠️ Full MCP Protocol** - Support for tools, prompts, and resources
- **📘 TypeScript** - Complete type safety with exported types

## Installation

```bash
npm install @mcp-ts/redis
```

## Quick Start

### Server-Side (Next.js)

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

## Documentation

Full documentation is available at: **[https://ashen-dusk.github.io/mcp-ts/](https://ashen-dusk.github.io/mcp-ts/)**

### Topics Covered:

- **[Getting Started](https://ashen-dusk.github.io/mcp-ts/docs/)** - Quick setup and overview
- **[Installation](https://ashen-dusk.github.io/mcp-ts/docs/installation)** - Detailed installation guide
- **[Next.js Integration](https://ashen-dusk.github.io/mcp-ts/docs/nextjs)** - Complete Next.js examples
- **[React Hook Guide](https://ashen-dusk.github.io/mcp-ts/docs/react-hook)** - Using the useMcp hook
- **[API Reference](https://ashen-dusk.github.io/mcp-ts/docs/api-reference)** - Complete API documentation

## Environment Setup

```bash
# Redis connection (required)
REDIS_URL=redis://localhost:6379

# Or for cloud Redis (Upstash, Redis Cloud, etc.)
REDIS_URL=rediss://default:password@host.upstash.io:6379
```

## Architecture

This package uses **Server-Sent Events (SSE)** instead of WebSockets:

┌─────────┐                    ┌──────────┐
│ Browser │◄───SSE Events──────│  Server  │
│         │                    │          │
│         ├────HTTP POST──────►│  (Node)  │
└─────────┘   (RPC calls)      └──────────┘
- Works behind corporate firewalls
- Built-in reconnection in browsers
- Simpler than WebSockets

## Contributing

Contributions are welcome! Please read [CLAUDE.md](./CLAUDE.md) for development guidelines.

## License

MIT © MCP Assistant

## Links

- **[Documentation](https://ashen-dusk.github.io/mcp-ts/)** - Full docs
- **[npm Package](https://www.npmjs.com/package/@mcp-ts/redis)** - Install from npm
- **[GitHub Repository](https://github.com/ashen-dusk/mcp-redis)** - Source code
- **[Issues](https://github.com/ashen-dusk/mcp-redis/issues)** - Report bugs
- **[MCP Protocol](https://modelcontextprotocol.io)** - Learn about MCP

---

> Built with 💙 by MCP Assistant • Powered by Redis & SSE
