<div align="center">
  <a href="https://github.com/zonlabs/mcp-ts">
    <img src="docs/static/img/logo.svg" alt="mcp-ts Logo" width="80" height="80" />
  </a>
  <h1 align="center">@mcp-ts</h1>
  <p>A Lightweight MCP (Model Context Protocol) client library with integrated persistence.</p>
</div>

<div align="center">
  <a href="https://github.com/zonlabs/mcp-ts/raw/main/docs/static/vid/mcp-ts.mp4">
    <em>Click to watch demo video</em>
  </a>
</div>
<br />


<div align="center">

| *Supported Frameworks* | *Supported Storage Backends* |
| :---: | :---: |
| <img src="docs/static/img/framework/next.svg" width="35" height="35" /> <img src="docs/static/img/framework/node.svg" width="35" height="35" /> <img src="docs/static/img/framework/react.svg" width="35" height="35" /> <img src="docs/static/img/framework/vue.svg" width="35" height="35" /> <img src="docs/static/img/framework/express.svg" width="35" height="35" /> | <img src="docs/static/img/storage-backend/redis.svg" width="35" height="35" /> <img src="docs/static/img/storage-backend/filesystem.svg" width="35" height="35" /> <img src="docs/static/img/storage-backend/memory.svg" width="35" height="35" /> <img src="docs/static/img/storage-backend/postgres.svg" width="35" height="35" /> |

</div>

<p align="center">
  <a href="https://www.npmjs.com/package/@mcp-ts/sdk">
    <img src="https://badge.fury.io/js/@mcp-ts%2Fcore.svg" alt="npm version" />
  </a>
  <a href="https://opensource.org/licenses/MIT">
    <img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT" />
  </a>
</p>



## Features

- **Real-Time SSE** - Server-Sent Events for live connection and observability updates
- **Flexible Storage** - Redis, File System, or In-Memory backends
- **Serverless-Ready** - Works in serverless environments (Vercel, AWS Lambda, etc.)
- **React Hook** - `useMcp` hook for easy React integration
- **Vue Composable** - `useMcp` composable for Vue applications
- **Full MCP Protocol** - Support for tools, prompts, and resources
- **TypeScript** - Complete type safety with exported types
- **PostgreSQL** - Coming soon!

## Inspiration

> [!NOTE]
> I got the idea for `@mcp-ts` while working on 🌐 **[MCP Assistant](https://mcp-assistant.in)**.
While building custom storage for persistence, managing the flow became harder than it should have been.
So I built this client to handle the heavy lifting of client applications and make agent interactions easier.
That’s how `@mcp-ts` started.

<br/>

<div align="center">
  <img src="docs/static/img/mcp-assistant.png" alt="MCP Assistant" width="100%" />
</div>

<br/>

## Installation

```bash
npm install @mcp-ts/sdk
```

The package supports multiple storage backends out of the box:
- **Memory** (default, no setup required)
- **File** (local persistence)
- **Redis** (production-ready, requires `npm install ioredis`)

## Quick Start

### Server-Side (Next.js)

```typescript
// app/api/mcp/route.ts
import { createNextMcpHandler } from '@mcp-ts/sdk/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const { GET, POST } = createNextMcpHandler({
  authenticate: () => {
    //  your logic here
  }
});
});
```

### Using with Vercel AI SDK

For advanced usage with `ai` SDK (e.g., `streamText`), use `MultiSessionClient` to aggregate tools from multiple servers.

```typescript
// app/api/chat/route.ts
import { MultiSessionClient } from '@mcp-ts/sdk/server';
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';

export async function POST(req: Request) {
  const { messages, identity } = await req.json();

  const mcp = new MultiSessionClient(identity);

  try {
    await mcp.connect();

    const tools = await mcp.getAITools();

    const result = streamText({
      model: openai('gpt-4'),
      messages,
      tools,
      onFinish: async () => {
        await mcp.disconnect();
      }
    });

    return result.toDataStreamResponse();
  } catch (error) {
    await mcp.disconnect();
    throw error;
  }
}
```

### Client-Side (React)

```typescript
'use client';
import { useMcp } from '@mcp-ts/sdk/client';

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

Full documentation is available at: **[Docs](https://zonlabs.github.io/mcp-ts/)**

### Topics Covered:

- **[Getting Started](https://zonlabs.github.io/mcp-ts/docs/)** - Quick setup and overview
- **[Installation](https://zonlabs.github.io/mcp-ts/docs/installation)** - Detailed installation guide
- **[Storage Backends](https://zonlabs.github.io/mcp-ts/docs/storage-backends)** - Redis, File, Memory options
- **[Next.js Integration](https://zonlabs.github.io/mcp-ts/docs/nextjs)** - Complete Next.js examples
- **[React Hook Guide](https://zonlabs.github.io/mcp-ts/docs/react-hook)** - Using the useMcp hook
- **[API Reference](https://zonlabs.github.io/mcp-ts/docs/api-reference)** - Complete API documentation

## Environment Setup

The library supports multiple storage backends. You can explicitly select one using `MCP_TS_STORAGE_TYPE` or rely on automatic detection.

**Supported Types:** `redis`, `file`, `memory`, and `postgresql` (coming soon).

### Configuration Examples

1.  **<img src="docs/static/img/storage-backend/redis.svg" width="20" height="20" align="center" /> Redis** (Recommended for production)
    ```bash
    MCP_TS_STORAGE_TYPE=redis
    REDIS_URL=redis://localhost:6379
    ```

2.  **<img src="docs/static/img/storage-backend/filesystem.svg" width="20" height="20" align="center" /> File System** (Great for local dev)
    ```bash
    MCP_TS_STORAGE_TYPE=file
    MCP_TS_STORAGE_FILE=./sessions.json
    ```

3.  **<img src="docs/static/img/storage-backend/memory.svg" width="20" height="20" align="center" /> In-Memory** (Default for testing)
    ```bash
    MCP_TS_STORAGE_TYPE=memory
    ```

4.  **<img src="docs/static/img/storage-backend/postgres.svg" width="20" height="20" align="center" /> PostgreSQL** (Coming soon)
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

> [!NOTE]
> This package (`@mcp-ts/sdk`) provides a unified MCP client with support for multiple storage backends (Memory, File, Redis). Storage backends use optional peer dependencies - install only what you need. Future releases may introduce separate storage plugins like `@mcp-ts/postgres` for even more flexibility.

## Contributing

Contributions are welcome! Please read [CLAUDE.md](./CLAUDE.md) for development guidelines.

## License

MIT © MCP Assistant



