<div align="center">
  <a href="https://github.com/zonlabs/mcp-ts">
    <img src="docs/static/img/logo.svg" alt="mcp-ts Logo" width="80" height="80" />
  </a>
  <h1 align="center">@mcp-ts</h1>
  <p>TypeScript SDK providing MCP capabilities to agents across JavaScript/cross-runtime environments.</p>
</div>

<div align="center">
  <a href="https://github.com/zonlabs/mcp-ts/raw/main/docs/static/vid/langchain-agui.mp4">
    <em>Click to watch demo video</em>
  </a>
</div>
<br />


<div align="center">

| *Supported Frameworks* | *Agent Frameworks and Protocol* | *Storage Backends* |
| :---: | :---: | :---: |
| <img src="docs/static/img/framework/next.svg" width="35" height="35" /> <img src="docs/static/img/framework/node.svg" width="35" height="35" /> <img src="docs/static/img/framework/react.svg" width="35" height="35" /> <img src="docs/static/img/framework/vue.svg" width="35" height="35" /> <img src="docs/static/img/framework/express.svg" width="35" height="35" /> | <img src="docs/static/img/framework/vercel.svg" width="35" height="35" /> <img src="docs/static/img/agent-framework/langchain.svg" width="35" height="35" /> <img src="docs/static/img/agent-framework/mastra.svg" width="35" height="35" /> <img src="docs/static/img/agent-framework/agui.webp" width="35" height="35" /> | <img src="docs/static/img/storage-backend/redis.svg" width="35" height="35" /> <img src="docs/static/img/storage-backend/sqlite.svg" width="35" height="35" /> <img src="docs/static/img/storage-backend/filesystem.svg" width="35" height="35" /> <img src="docs/static/img/storage-backend/memory.svg" width="35" height="35" /> |

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
- **Flexible Storage** - Redis, SQLite, File System, or In-Memory backends
- **Serverless-Ready** - Works in serverless environments (Vercel, AWS Lambda, etc.)
- **React Hook** - `useMcp` hook for easy React integration
- **Vue Composable** - `useMcp` composable for Vue applications
- **Full MCP Protocol** - Support for tools, prompts, and resources
- **Agent Adapters** - Built-in adapters for AI SDK, LangChain, Mastra, and AG-UI
- **MCP Apps Extension (SEP-1865)** - Interactive UI-driven tool interfaces

<div align="center">
  <img src="docs/static/img/mcp-apps.png" alt="MCP Apps" width="100%" />
  <p><em>MCP Apps: Rich interactive tool UIs</em></p>
</div>

## Inspiration

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
- **SQLite** (fast local persistence, requires `npm install better-sqlite3`)
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
import { AIAdapter } from '@mcp-ts/sdk/adapters/ai';
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';

export async function POST(req: Request) {
  const { messages, identity } = await req.json();

  const client = new MultiSessionClient(identity);

  try {
    await client.connect();

    const tools = await AIAdapter.getTools(client);


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

### <img src="docs/static/img/agent-framework/agui.webp" width="20" height="20" align="center" /> AG-UI Middleware

Execute MCP tools server-side when using remote agents (LangGraph, AutoGen, etc.):

```typescript
import { HttpAgent } from "@ag-ui/client";
import { AguiAdapter } from "@mcp-ts/sdk/adapters/agui-adapter";
import { createMcpMiddleware } from "@mcp-ts/sdk/adapters/agui-middleware";

// Connect to MCP servers
const { MultiSessionClient } = await import("@mcp-ts/sdk/server");
const client = new MultiSessionClient("user_123");
await client.connect();

// Create adapter and get tools
const adapter = new AguiAdapter(client);
const mcpTools = await adapter.getTools();

// Create agent with middleware
const agent = new HttpAgent({ url: "http://localhost:8000/agent" });
agent.use(createMcpMiddleware({
  toolPrefix: 'server-',
  tools: mcpTools,
}));
```

The middleware intercepts tool calls from remote agents, executes MCP tools server-side, and returns results back to the agent.

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

**Supported Types:** `redis`, `sqlite`, `file`, `memory`.

### Configuration Examples

1.  **<img src="docs/static/img/storage-backend/redis.svg" width="20" height="20" align="center" /> Redis** (Recommended for production)
    ```bash
    MCP_TS_STORAGE_TYPE=redis
    REDIS_URL=redis://localhost:6379
    ```

2.  **<img src="docs/static/img/storage-backend/sqlite.svg" width="20" height="20" align="center" /> SQLite** (Fast & Persistent)
    ```bash
    MCP_TS_STORAGE_TYPE=sqlite
    # Optional path
    MCP_TS_STORAGE_SQLITE_PATH=./sessions.db
    ```

3.  **<img src="docs/static/img/storage-backend/filesystem.svg" width="20" height="20" align="center" /> File System** (Great for local dev)
    ```bash
    MCP_TS_STORAGE_TYPE=file
    MCP_TS_STORAGE_FILE=./sessions.json
    ```

4.  **<img src="docs/static/img/storage-backend/memory.svg" width="20" height="20" align="center" /> In-Memory** (Default for testing)
    ```bash
    MCP_TS_STORAGE_TYPE=memory
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
> This package (`@mcp-ts/sdk`) provides a unified MCP client with support for adapters and storage backends such as AI SDK, Mastra, LangChain, and Redis.
> Adapters and storage backends are loaded via **optional peer dependencies** and must be installed independently. This ensures your application only includes the integrations you explicitly choose, keeping bundle size small and avoiding unnecessary dependencies.
> The SDK includes built-in support for **Memory** and **File** storage, while additional backends (such as Redis) and adapters can be added without impacting users who don’t need them.

For more details, refer to the documentation and follow the **installation guide for each adapter or storage backend**.

- [AI SDK Installation Guide](https://zonlabs.github.io/mcp-ts/docs/adapters#installation)
- [Mastra Installation Guide](https://zonlabs.github.io/mcp-ts/docs/adapters#installation)
- [LangChain Installation Guide](https://zonlabs.github.io/mcp-ts/docs/adapters#installation)
- [Redis Storage Installation Guide](https://zonlabs.github.io/mcp-ts/docs/storage-backends#-redis-production)


## Contributing

Contributions are welcome! Please read [CLAUDE.md](./CLAUDE.md) for development guidelines.

## License

MIT © MCP Assistant



