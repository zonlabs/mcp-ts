# @mcp-ts/client

High-performance Model Context Protocol (MCP) SDK for TypeScript and Node.js with OAuth 2.1 lifecycle management, multi-tenant durable sessions across Redis, SQLite, Neon, and Supabase, dynamic context-window optimization via `ToolRouter`, and first-class AI framework adapters.

```bash
npm install @mcp-ts/client @modelcontextprotocol/client @modelcontextprotocol/core
```

---

## 🚀 Quick Start

### 1. Server Management & OAuth (`client.mcpServers`)

Manage MCP server connections, discover OAuth metadata, and handle token flows with standard CRUD:

```typescript
import { client } from '@mcp-ts/client';

// 1. Discover OAuth capabilities on-demand
const discovery = await client.mcpServers.discoverOAuth({
  url: 'https://mcp.exa.ai/mcp?login',
});
if (discovery.supported) {
  console.log('Authorization endpoint:', discovery.authorizationUrl);
  console.log('CIMD supported:', discovery.clientIdMetadataDocumentSupported);
}

// 2. Register an MCP server (auto-validates connectivity & auth)
const server = await client.mcpServers.create({
  userId: 'user_123',
  name: 'Exa AI',
  url: 'https://mcp.exa.ai/mcp?login',
  auth: {
    type: 'oauth',
    config: {
      clientMetadataUrl: 'https://myapp.com/oauth/client-metadata.json',
      scopes: ['mcp:tools'],
    },
  },
});

// Check live connection status:
// If OAuth is required: status = { state: 'auth_required', authorizationUrl: '...' }
// If server is keyless / open (e.g. Firecrawl): auth auto-resolves to 'none' with state: 'connected'
if (server.status.state === 'auth_required') {
  console.log('Redirect user to authorize:', server.status.authorizationUrl);
}

// 3. Complete OAuth authorization code exchange in your callback route
await client.mcpServers.finishAuth({
  userId: 'user_123',
  code: req.query.code,
  state: req.query.state,
});

// 4. List user servers
const { data } = await client.mcpServers.find({ userId: 'user_123' });
```

### 2. Server-Side RPC Route (Next.js App Router)

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

### 3. Programmatic Capabilities (`client.mcpServers`)

Execute tools, fetch prompts, and read resources directly on user MCP servers with automatic connection pooling:

```typescript
import { client } from '@mcp-ts/client';

// 1. List tools and execute directly
const { tools } = await client.mcpServers.listTools({
  userId: 'user_123',
  serverId: 'tavily_search',
});

const response = await client.mcpServers.callTool({
  userId: 'user_123',
  serverId: 'tavily_search',
  toolName: 'search',
  args: { query: 'Model Context Protocol' },
});

// 2. Work with prompts
const { prompts } = await client.mcpServers.listPrompts({ userId: 'user_123', serverId: 'assistant' });
const prompt = await client.mcpServers.getPrompt({
  userId: 'user_123',
  serverId: 'assistant',
  name: 'code_review',
  args: { diff: '...' },
});

// 3. Work with resources
const { resources } = await client.mcpServers.listResources({ userId: 'user_123', serverId: 'fs' });
const content = await client.mcpServers.readResource({
  userId: 'user_123',
  serverId: 'fs',
  uri: 'file:///workspace/README.md',
});
```

### OAuth client registration and CIMD

When an MCP server requires OAuth, the client chooses a registration method in this order:

1. Supplied client information, when `clientInformation` is already configured.
2. Client ID Metadata Documents (CIMD), when `clientMetadataUrl` is configured and the authorization server advertises `client_id_metadata_document_supported: true`.
3. Dynamic Client Registration (DCR), as a fallback when CIMD is unavailable or unsupported.

Configure CIMD with a stable HTTPS URL for the metadata document:

```typescript
const client = new MCPClient({
  userId: 'user_123',
  sessionId: 'session_123',
  serverUrl: 'https://mcp.example.com/mcp',
  serverId: 'example',
  callbackUrl: 'https://app.example.com/oauth/callback',
  clientMetadataUrl: 'https://app.example.com/oauth/client-metadata.json',
});
```

The host application must serve that URL over HTTPS. The document must be valid JSON and include at least `client_id`, `client_name`, and `redirect_uris`. Its `client_id` must match the metadata URL exactly, including scheme, host, path, and any other URL components. The configured `callbackUrl` must be included in `redirect_uris` and remain identical throughout the authorization and callback flow.

For example, a framework-neutral GET route can return the document as JSON:

```text
GET /oauth/client-metadata.json
Content-Type: application/json

{
  "client_id": "https://app.example.com/oauth/client-metadata.json",
  "client_name": "Example MCP Client",
  "redirect_uris": ["https://app.example.com/oauth/callback"],
  "token_endpoint_auth_method": "none"
}
```

The authorization server decides whether CIMD is available from its OAuth metadata. When it does not advertise support, `mcp-ts` falls back to DCR if the server provides a registration endpoint.

---

## 🔌 Framework Adapters

Integrating with agent frameworks is simple using built-in adapters.

### Vercel AI SDK

Pass all user MCP servers seamlessly to `generateText` or `streamText`:

```typescript
// app/api/chat/route.ts
import { McpManager } from '@mcp-ts/client';
import { AIAdapter } from '@mcp-ts/client/adapters/ai';
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';

export async function POST(req: Request) {
  const { messages, userId } = await req.json();
  const manager = new McpManager(userId);
  await manager.connect();

  const adapter = new AIAdapter(manager);
  const tools = await adapter.getTools();

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
import { McpManager } from '@mcp-ts/client';
import { LangChainAdapter } from '@mcp-ts/client/adapters/langchain';

const manager = new McpManager('user_123');
await manager.connect();

const adapter = new LangChainAdapter(manager);
const tools = await adapter.getTools();
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
import { McpManager, ToolRouter } from '@mcp-ts/client';
import { AIAdapter } from '@mcp-ts/client/adapters/ai';

const manager = new McpManager('user_123');
await manager.connect();

// 1. Dynamic discovery via ToolRouter (BM25 search + pinned tools):
const router = new ToolRouter(manager, {
  pinnedTools: ['slack_send_message'],
});

const adapter = new AIAdapter(manager, { toolRouter: router });
const tools = await adapter.getTools();

// 2. OR zero-token dynamic context via AI SDK v7 deferLoading:
const deferredAdapter = new AIAdapter(manager, { deferLoading: true });
const deferredTools = await deferredAdapter.getTools();
```

---

## ⚙️ Storage Backends & Environment Setup

The library supports multiple durable storage backends out of the box. You can explicitly select one via `MCP_TS_STORAGE_TYPE` or specify it programmatically.

**Supported Types:** `redis`, `sqlite`, `neon`, `supabase`, `file`, `memory`.

### Programmatic Configuration

```typescript
import { createClient, RedisStorageBackend } from '@mcp-ts/client';
import { Redis } from 'ioredis';

// Custom Redis client
const redis = new Redis(process.env.REDIS_URL!);
const client = createClient({
  storage: new RedisStorageBackend(redis),
});
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

## 📚 Documentation Links

- **[Getting Started Guide](https://docs.linkos.in/get-started)**
- **[Installation Guide](https://docs.linkos.in/install)**
- **[AI SDK Integration](https://docs.linkos.in/ai-adapters/ai-sdk)**
- **[Mastra Integration](https://docs.linkos.in/ai-adapters/mastra)**
- **[LangChain Integration](https://docs.linkos.in/ai-adapters/langchain)**
- **[Storage Backends Overview](https://docs.linkos.in/storage-backends/overview)**
- **[Redis Storage Guide](https://docs.linkos.in/storage-backends/redis)**
- **[Next.js Integration](https://docs.linkos.in/nextjs)**
- **[React Hook Guide](https://docs.linkos.in/react)**
- **[API Reference](https://docs.linkos.in/reference/server)**

---

## 🤝 Contributing & License

- Read [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines.
- License: MIT © [ZonLabs](https://github.com/zonlabs)
