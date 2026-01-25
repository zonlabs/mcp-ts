# @mcp-ts/redis

Lightweight MCP (Model Context Protocol) client library for JavaScript applications with Redis-backed session management and real-time SSE support.

[![npm version](https://badge.fury.io/js/@mcp-ts%2Fredis.svg)](https://www.npmjs.com/package/@mcp-ts/redis)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- **⚡ Real-Time SSE** - Server-Sent Events for live connection updates
- **💾 Flexible Storage** - Redis, File System, or In-Memory backends
- **🚀 Serverless-Ready** - Works in serverless environments (Vercel, AWS Lambda, etc.)
- **⚛️ React Hook** - `useMcp` hook for easy React integration
- **🖖 Vue Composable** - `useMcp` composable for Vue applications
- **🛠️ Full MCP Protocol** - Support for tools, prompts, and resources
- **📘 TypeScript** - Complete type safety with exported types
- **🐘 PostgreSQL** - Coming soon!

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

```
42: ### Client-Side (React)
43: 
44: ```typescript
45: 'use client';
46: import { useMcp } from '@mcp-ts/redis/client/react';
47: 
48: function App() {
49:   // ... React implementation
50: }
51: ```
52: 
53: ### Client-Side (Vue)
54: 
55: ```typescript
56: import { useMcp } from '@mcp-ts/redis/client/vue';
57: 
58: const { connections, connect, status } = useMcp({
59:   url: '/api/mcp',
60:   identity: 'user-123',
61: });
62: ```

## Documentation

Full documentation is available at: **[https://ashen-dusk.github.io/mcp-ts/](https://ashen-dusk.github.io/mcp-ts/)**

### Topics Covered:

- **[Getting Started](https://ashen-dusk.github.io/mcp-ts/docs/)** - Quick setup and overview
- **[Installation](https://ashen-dusk.github.io/mcp-ts/docs/installation)** - Detailed installation guide
- **[Storage Backends](https://ashen-dusk.github.io/mcp-ts/docs/storage-backends)** - Redis, File, Memory options
- **[Next.js Integration](https://ashen-dusk.github.io/mcp-ts/docs/nextjs)** - Complete Next.js examples
- **[React Hook Guide](https://ashen-dusk.github.io/mcp-ts/docs/react-hook)** - Using the useMcp hook
- **[API Reference](https://ashen-dusk.github.io/mcp-ts/docs/api-reference)** - Complete API documentation

## Environment Setup

The library supports multiple storage backends. You can explicitly select one using `MCP_TS_STORAGE_TYPE` or rely on automatic detection.

**Supported Types:** `redis`, `file`, `memory`, and `postgresql` (coming soon).

### Configuration Examples

1.  **<img src="docs/static/img/redis.svg" width="20" height="20" align="center" /> Redis** (Recommended for production)
    ```bash
    MCP_TS_STORAGE_TYPE=redis
    REDIS_URL=redis://localhost:6379
    ```

2.  **<img src="docs/static/img/filesystem.svg" width="20" height="20" align="center" /> File System** (Great for local dev)
    ```bash
    MCP_TS_STORAGE_TYPE=file
    MCP_TS_STORAGE_FILE=./sessions.json
    ```

3.  **<img src="docs/static/img/memory.svg" width="20" height="20" align="center" /> In-Memory** (Default for testing)
    ```bash
    MCP_TS_STORAGE_TYPE=memory
    ```

4.  **<img src="docs/static/img/postgres.svg" width="20" height="20" align="center" /> PostgreSQL** (Coming soon)
    ```bash
    # Future release
    MCP_TS_STORAGE_TYPE=postgresql
    DATABASE_URL=postgresql://user:pass@host:5432/db
    ```


## Architecture

This package uses **Server-Sent Events (SSE)** instead of WebSockets:


```mermaid
graph TD
    subgraph Client ["Browser (React)"]
        UI[UI Components]
        Hook[useMcp Hook]
        UI <--> Hook
    end

    subgraph Server ["Next.js Server (Node.js)"]
        API[API Route /api/mcp]
        SSE[SSE Handler]
        ClientMgr[MCP Client Manager]
        
        API <--> ClientMgr
        ClientMgr --> SSE
    end

    subgraph Infrastructure
        Redis[(Redis Session Store)]
    end

    subgraph External ["External MCP Servers"]
        TargetServer[Target MCP Server]
    end

    Hook -- "HTTP POST (RPC)" --> API
    SSE -- "Server-Sent Events" --> Hook
    ClientMgr -- "Persist State" <--> Redis
    ClientMgr -- "MCP Protocol" <--> TargetServer
```

- **Browser**: React application using the `useMcp` hook for state management.
- **Next.js Server**: Acts as a bridge, maintaining connections to external MCP servers.
- **Storage**: Persists session state, OAuth tokens, and connection details (Redis, File, or Memory).
- **SSE**: Delivers real-time updates (logs, tool list changes) to the client.

## Contributing

Contributions are welcome! Please read [CLAUDE.md](./CLAUDE.md) for development guidelines.

## License

MIT © MCP Assistant



