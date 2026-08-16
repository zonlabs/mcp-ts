# @mcp-ts/client

High-performance Model Context Protocol (MCP) SDK for TypeScript and Node.js with OAuth 2.1 lifecycle management, multi-tenant durable sessions across Redis, SQLite, Neon, and Supabase, dynamic context-window optimization via `ToolRouter`, and first-class AI framework adapters.

```bash
npm install @mcp-ts/client @modelcontextprotocol/client @modelcontextprotocol/core
```

---

## Architecture & Core Concepts

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
| **`Mcp`** | App & Storage Root | Zero-config instance or app-wide database configuration |
| **`McpUser`** | User Context | Adding/listing MCP servers and running tools per user |
| **`McpClient`** | Single Connection | Direct connection to a single remote MCP server |
| **`McpManager`** | Connection Pool | High-throughput batch connection management |
| **`ToolRouter`** | Dynamic Optimization | 80–95% token savings using smart tool discovery |
| **`AIAdapter`** | Framework Bindings | Turn MCP servers into tools for Vercel AI SDK, LangChain, etc. |

---

## Quick Start

### 1. User-Scoped Multi-Server Management

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

### 2. Vercel AI SDK Integration

Seamlessly pass all user MCP servers to `generateText` or `streamText`:

```typescript
import { mcp } from '@mcp-ts/client';
import { AIAdapter } from '@mcp-ts/client/adapters/ai';
import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';

const user = mcp.user('user_123');

const { text } = await generateText({
  model: openai('gpt-4o'),
  prompt: 'What are the top news headlines today?',
  tools: await AIAdapter.getTools(user),
});
```

---

### 3. Dynamic Tool Routing (`ToolRouter`)

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

### 4. Direct Single Server Connection (`McpClient`)

For low-level single-server connections without user storage:

```typescript
import { McpClient } from '@mcp-ts/client';

const client = new McpClient({
  userId: 'user_123',
  sessionId: 'sess_custom_1',
  serverId: 'tavily',
  serverUrl: 'https://mcp.tavily.com/mcp',
  callbackUrl: 'http://localhost:3000/oauth/callback',
});

await client.connect();
const { tools } = await client.listTools();
const result = await client.callTool('tavily_search', { query: 'MCP SDK' });
```

---

### 5. Durable Storage Backends

Persist user credentials and sessions across server restarts:

```typescript
import { Mcp } from '@mcp-ts/client';
import { RedisStorageBackend, sessions } from '@mcp-ts/client';

// Custom Redis storage
const mcp = new Mcp({
  storage: sessions.use('redis', {
    redisUrl: process.env.REDIS_URL,
  }),
});

// Or Supabase / Neon / SQLite
const user = mcp.user('user_123');
```

Supported storage backends:
- **`sqlite`** (Default for local Node.js environments)
- **`redis`** (Redis & Upstash)
- **`neon`** (Neon Serverless Postgres)
- **`supabase`** (Supabase Postgres)
- **`memory`** (In-memory transient store)

---

## SDK Entry Points

| Entry Point | Description |
| :--- | :--- |
| **`@mcp-ts/client`** | Root exports: `mcp`, `Mcp`, `McpUser`, `McpClient`, `McpManager`, `ToolRouter` |
| **`@mcp-ts/client`** | Server-side handlers (`createNextMcpHandler`), storage engines, and middleware |
| **`@mcp-ts/client/adapters/ai`** | Vercel AI SDK integration (`AIAdapter.getTools`) |
| **`@mcp-ts/client/adapters/langchain`** | LangChain / LangGraph tool binding (`LangChainAdapter.getTools`) |
| **`@mcp-ts/client/adapters/mastra`** | Mastra agent framework adapter (`MastraAdapter.getTools`) |
| **`@mcp-ts/client/adapters/agui-adapter`** | AG-UI Client adapter |
| **`@mcp-ts/client/adapters/agui-middleware`** | AG-UI chat & streaming middleware |
| **`@mcp-ts/client/sse`** | Browser JSON-RPC client primitives |
| **`@mcp-ts/client/react`** | React hooks (`useMcp`, `useMcpApps`, `useMcpOAuthPopup`) |
| **`@mcp-ts/client/vue`** | Vue composables (`useMcp`) |
| **`@mcp-ts/client/shared`** | Shared types, interfaces (`BaseClient`, `ToolClient`), and event emitters |

---

## Next.js SSE Route Handler

Expose a full MCP bridge endpoint for your frontend in 5 lines:

```typescript
// app/api/mcp/sse/route.ts
import { createNextMcpHandler } from '@mcp-ts/client';

export const { GET, POST } = createNextMcpHandler();
```

---

## License

MIT © [ZonLabs](https://github.com/zonlabs)
