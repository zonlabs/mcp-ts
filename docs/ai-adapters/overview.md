---
title: "Adapters Overview"
sidebarTitle: "Overview"
description: "Compare the mcp-ts adapters for Vercel AI SDK, LangChain, Mastra, and AG-UI and pick the right integration for your AI framework or agent runtime."
---

Adapters transforms MCP tools into framework-specific formats for seamless integration with AI frameworks.

## Available adapters

| Adapter | Framework | Import Path | Dependencies |
|---------|-----------|-------------|--------------|
| **AI SDK** | Vercel AI SDK | `@mcp-ts/sdk/adapters/ai` | `ai` |
| **LangChain** | LangChain | `@mcp-ts/sdk/adapters/langchain` | `@langchain/core`, `zod` |
| **Mastra** | Mastra | `@mcp-ts/sdk/adapters/mastra` | `zod` |
| **AG-UI** | AG-UI Protocol | `@mcp-ts/sdk/adapters/agui-adapter` | `@ag-ui/client`, `rxjs` |

## Common patterns

### Custom prefix

Avoid tool name collisions by adding a custom prefix to all tools from a specific adapter:

```typescript
const adapter = new AIAdapter(client, {
  prefix: 'myapp'  // Tools named: myapp_search, myapp_fetch, etc.
});
```

### Single client vs. multi-session

Adapters work with both individual `MCPClient` instances andaggregated `MultiSessionClient`.

#### Single client
```typescript
import { MCPClient } from '@mcp-ts/sdk/server';

const client = new MCPClient({
  userId: 'user_123',
  sessionId: 'session_abc',
  serverUrl: 'https://mcp-server.com',
  callbackUrl: 'https://myapp.com/callback'
});

await client.connect();
const adapter = new AIAdapter(client);
```

#### Multi-session
```typescript
const client = new MultiSessionClient('user_123');

// Connect to multiple servers
await client.connect();

// Get all tools from all currently connected servers
const adapter = new AIAdapter(client);
const tools = await adapter.getTools();
```

## Error handling

All adapters handle disconnected clients gracefully:

```typescript
const adapter = new AIAdapter(client);
const tools = await adapter.getTools();
// Returns empty object/array if client is disconnected
```
