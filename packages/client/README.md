# @mcp-ts/client

High-performance Model Context Protocol (MCP) SDK for TypeScript and Node.js with OAuth 2.1 lifecycle management, multi-tenant durable sessions across Redis, SQLite, Neon, and Supabase, dynamic context-window optimization via `ToolRouter`, and first-class AI framework adapters.

```bash
npm install @mcp-ts/client @modelcontextprotocol/client @modelcontextprotocol/core
```

---

## 🏗️ Architecture & Core Concepts

```mermaid
graph LR
    subgraph Direct["Direct SDK Flow (TypeScript)"]
        UI["Browser UI"]
        Hook["useMcp Hook"]
        API["Next.js /api/mcp"]
        Mgr["McpManager"]
        Store[("Redis / SQLite / File / Memory")]
        MCP["MCP Servers"]

        UI <--> Hook
        Hook -- "HTTP RPC" --> API
        API --> Mgr
        Mgr -- "SSE events" --> Hook
        Mgr <--> Store
        Mgr <--> MCP
    end
```

```
┌────────────────────────────────────────────────────────┐
│                          mcp                           │  App / Storage root
│         (Configures durable storage & tenants)         │
└───────────────────────────┬────────────────────────────┘
                            │ .user(userId)
┌───────────────────────────▼────────────────────────────┐
│                        McpUser                         │  User / Tenant context
│  (addMcpServer, listMcpServers, finishAuth, listTools) │
└─────────────┬───────────────────────────┬──────────────┘
              │                           │
┌─────────────▼───────────────┐ ┌─────────▼──────────────┐
│         McpManager          │ │       ToolRouter       │
│  (Connection pool & cache)  │ │ (Context optimization) │
└─────────────┬───────────────┘ └─────────┬──────────────┘
              │                           │
┌─────────────▼───────────────┐ ┌─────────▼──────────────┐
│          McpClient          │ │      AI Adapters       │
│   (OAuth 2.1, SSE/HTTP)     │ │ (AI SDK, LangChain...) │
└─────────────────────────────┘ └────────────────────────┘
```

| Class / Module | Purpose | Primary Use Case |
| :--- | :--- | :--- |
| **`mcp` / `Mcp`** | App & Storage Root | Zero-config instance or app-wide database configuration |
| **`McpUser`** | User Context | Adding/listing MCP servers and running tools per user |
| **`McpClient`** | Single Connection | Direct connection to a single remote MCP server |
| **`McpManager`** | Connection Pool | High-throughput batch connection management |
| **`ToolRouter`** | Dynamic Optimization | 80–95% token savings using smart tool discovery |
| **`AIAdapter`** | Framework Bindings | Turn MCP servers into tools for Vercel AI SDK, LangChain, etc. |

---

## 🚀 Quick Start

### 1. Server-Side (Next.js App Router)

Expose a full MCP endpoint with authentication in your Next.js application:

```typescript
// app/api/mcp/route.ts
import { createNextMcpHandler } from '@mcp-ts/client';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const { GET, POST } = createNextMcpHandler({
  authenticate: async (req) => {
    // Return user auth context / user ID
    return { userId: 'user-123' };
  }
});
```

---

### 2. Client-Side (React Hook)

Connect and manage MCP servers directly from your React UI:

```tsx
'use client';

import { useMcp } from '@mcp-ts/client/react';

export function McpControlPanel() {
  const { connections, connect } = useMcp({
    url: '/api/mcp',
    userId: 'user-123',
  });

  return (
    <div className="flex flex-col items-center gap-4">
      <button
        onClick={() =>
          connect({
            serverId: 'my-server',
            serverName: 'My MCP Server',
            serverUrl: 'https://mcp.example.com',
            callbackUrl: `${window.location.origin}/callback`,
          })
        }
      >
        Connect Server
      </button>

      {connections.map((conn) => (
        <div key={conn.sessionId} className="p-4 border rounded">
          <h3>{conn.serverName}</h3>
          <p>State: {conn.state}</p>
          <p>Tools: {conn.tools.length}</p>
        </div>
      ))}
    </div>
  );
}
```

---

### 3. Programmatic User-Scoped Management

```typescript
import { mcp } from '@mcp-ts/client';

const user = mcp.user('user_123');

// Connect an MCP server (supports SSE & Streamable HTTP)
const result = await user.addMcpServer('https://mcp.tavily.com/mcp');

if (result.authRequired) {
  // Server requires OAuth 2.1 browser sign-in
  console.log('Redirect user to:', result.authUrl);
} else {
  console.log('Server connected! Session ID:', result.sessionId);
}

// In your OAuth callback route:
await user.finishAuth(code, state, iss);

// List all active user tools across connected servers
const { tools } = await user.listTools();

// Execute a tool directly
const response = await user.callTool('tavily_search', { query: 'Model Context Protocol' });
```

---

## 🔌 Framework Adapters

Integrating with agent frameworks is simple using built-in adapters.

### Vercel AI SDK

Pass all user MCP servers seamlessly to `generateText` or `streamText`:

```typescript
// app/api/chat/route.ts
import { mcp } from '@mcp-ts/client';
import { AIAdapter } from '@mcp-ts/client/adapters/ai';
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';

export async function POST(req: Request) {
  const { messages, userId } = await req.json();
  const user = mcp.user(userId);

  const tools = await AIAdapter.getTools(user);

  const result = streamText({
    model: openai('gpt-4o'),
    messages,
    tools,
  });

  return result.toDataStreamResponse();
}
```

### AG-UI Adapter

```typescript
import { McpManager } from '@mcp-ts/client';
import { AguiAdapter } from '@mcp-ts/client/adapters/agui-adapter';

const client = new McpManager('user_123');
await client.connect();

const adapter = new AguiAdapter(client);
const tools = await adapter.getTools();
```

### Mastra Adapter

```typescript
import { McpManager } from '@mcp-ts/client';
import { MastraAdapter } from '@mcp-ts/client/adapters/mastra-adapter';

const client = new McpManager('user_123');
await client.connect();

const tools = await MastraAdapter.getTools(client);
```

### LangChain Adapter

```typescript
import { mcp } from '@mcp-ts/client';
import { LangChainAdapter } from '@mcp-ts/client/adapters/langchain';

const user = mcp.user('user_123');
const tools = await LangChainAdapter.getTools(user);
```

---

## 🧩 AG-UI Middleware

Execute MCP tools server-side when using remote agent frameworks (LangGraph, AutoGen, CrewAI, etc.):

```typescript
import { HttpAgent } from '@ag-ui/client';
import { McpManager } from '@mcp-ts/client';
import { AguiAdapter } from '@mcp-ts/client/adapters/agui-adapter';
import { createMcpMiddleware } from '@mcp-ts/client/adapters/agui-middleware';

// 1. Connect to MCP servers
const client = new McpManager('user_123');
await client.connect();

// 2. Extract tools
const adapter = new AguiAdapter(client);
const mcpTools = await adapter.getTools();

// 3. Attach middleware to remote agent
const agent = new HttpAgent({ url: 'http://localhost:8000/agent' });
agent.use(
  createMcpMiddleware({
    toolPrefix: 'server-',
    tools: mcpTools,
  })
);
```

The middleware intercepts tool calls from remote agents, executes MCP tools server-side, and returns results back to the agent.

---

## 🛠️ MCP Apps Extension (SEP-1865)

Render interactive UIs for your tools using `McpAppRenderer`:

```tsx
import { useRenderToolCall } from '@copilotkit/react-core';
import { McpAppRenderer } from '@mcp-ts/client/react';
import { useMcpContext } from './mcp';

export function ToolRenderer() {
  const { mcpClient } = useMcpContext();

  useRenderToolCall({
    name: '*',
    render: ({ name, args, result, status }) => (
      <McpAppRenderer
        client={mcpClient}
        name={name}
        input={args}
        result={result}
        status={status}
      />
    ),
  });

  return null;
}
```

---

## 🧠 Dynamic Tool Routing (`ToolRouter`)

For users with dozens or hundreds of tools, `ToolRouter` dynamically injects discovery meta-tools (`mcp_search_tools`, `mcp_execute_tool`) into the LLM context, reducing token usage by up to 95%:

```typescript
import { mcp } from '@mcp-ts/client';
import { AIAdapter } from '@mcp-ts/client/adapters/ai';

const user = mcp.user('user_123');

// LLM only receives lightweight discovery tools until execution
const tools = await AIAdapter.getTools(user, {
  strategy: 'all',
  enableSmartRouting: true,
});
```

---

## ⚙️ Storage Backends & Environment Setup

The library supports multiple durable storage backends out of the box. You can explicitly select one via `MCP_TS_STORAGE_TYPE` or specify it programmatically.

**Supported Types:** `redis`, `sqlite`, `neon`, `supabase`, `file`, `memory`.

### Programmatic Configuration

```typescript
import { Mcp, sessions } from '@mcp-ts/client';

// Redis storage
const mcp = new Mcp({
  storage: sessions.use('redis', {
    redisUrl: process.env.REDIS_URL,
  }),
});

const user = mcp.user('user_123');
```

### Environment Variable Setup

1. **Redis** (Recommended for production):
   ```bash
   MCP_TS_STORAGE_TYPE=redis
   REDIS_URL=redis://localhost:6379
   ```

2. **SQLite** (Fast & Persistent):
   ```bash
   MCP_TS_STORAGE_TYPE=sqlite
   MCP_TS_STORAGE_SQLITE_PATH=./sessions.db
   ```

3. **Neon** (Serverless Postgres):
   ```bash
   MCP_TS_STORAGE_TYPE=neon
   NEON_DATABASE_URL=postgresql://user:password@host.neon.tech/dbname?sslmode=verify-full&channel_binding=require
   ```

4. **File System** (Great for local dev):
   ```bash
   MCP_TS_STORAGE_TYPE=file
   MCP_TS_STORAGE_FILE=./sessions.json
   ```

5. **In-Memory** (Default for testing):
   ```bash
   MCP_TS_STORAGE_TYPE=memory
   ```

---

## 📦 Peer Dependencies & Package Exports

> [!NOTE]
> Adapters and external storage backends are loaded via **optional peer dependencies** and must be installed independently. This ensures your application only includes the integrations you explicitly choose, keeping bundle sizes small.

### Entry Points

| Entry Point | Description |
| :--- | :--- |
| **`@mcp-ts/client`** | Root exports: `mcp`, `Mcp`, `McpUser`, `McpClient`, `McpManager`, `ToolRouter` |
| **`@mcp-ts/client/adapters/ai`** | Vercel AI SDK integration (`AIAdapter.getTools`) |
| **`@mcp-ts/client/adapters/langchain`** | LangChain / LangGraph tool binding (`LangChainAdapter.getTools`) |
| **`@mcp-ts/client/adapters/mastra`** | Mastra agent framework adapter (`MastraAdapter.getTools`) |
| **`@mcp-ts/client/adapters/agui-adapter`** | AG-UI Client adapter |
| **`@mcp-ts/client/adapters/agui-middleware`** | AG-UI chat & streaming middleware |
| **`@mcp-ts/client/sse`** | Browser JSON-RPC client primitives |
| **`@mcp-ts/client/react`** | React hooks (`useMcp`, `useMcpApps`, `useMcpOAuthPopup`, `McpAppRenderer`) |
| **`@mcp-ts/client/vue`** | Vue composables (`useMcp`) |
| **`@mcp-ts/client/shared`** | Shared types, interfaces (`BaseClient`, `ToolClient`), and event emitters |

---

## 📚 Documentation Links

- **[Getting Started Guide](https://docs.mcp-assistant.in/get-started)**
- **[Installation Guide](https://docs.mcp-assistant.in/install)**
- **[AI SDK Integration](https://docs.mcp-assistant.in/ai-adapters/ai-sdk)**
- **[Mastra Integration](https://docs.mcp-assistant.in/ai-adapters/mastra)**
- **[LangChain Integration](https://docs.mcp-assistant.in/ai-adapters/langchain)**
- **[Storage Backends Overview](https://docs.mcp-assistant.in/storage-backends/overview)**
- **[Redis Storage Guide](https://docs.mcp-assistant.in/storage-backends/redis)**
- **[Next.js Integration](https://docs.mcp-assistant.in/nextjs)**
- **[React Hook Guide](https://docs.mcp-assistant.in/react)**
- **[API Reference](https://docs.mcp-assistant.in/reference/server)**

---

## 🤝 Contributing & License

- Read [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines.
- License: MIT © [ZonLabs](https://github.com/zonlabs)
