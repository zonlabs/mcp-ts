---
title: "AI framework adapters for MCP tools"
sidebarTitle: "Overview"
description: "Compare the Vercel AI SDK, LangChain, Mastra, and AG-UI adapters and learn shared patterns like prefixing, multi-session clients, and tool approval."
---

Adapters transforms MCP tools into framework-specific formats for seamless integration with AI frameworks.

## Available Adapters

| Adapter | Framework | Import Path | Dependencies |
|---------|-----------|-------------|--------------|
| **AI SDK** | Vercel AI SDK | `@mcp-ts/sdk/adapters/ai` | `ai` |
| **LangChain** | LangChain | `@mcp-ts/sdk/adapters/langchain` | `@langchain/core`, `zod` |
| **Mastra** | Mastra | `@mcp-ts/sdk/adapters/mastra` | `zod` |
| **AG-UI** | AG-UI Protocol | `@mcp-ts/sdk/adapters/agui-adapter` | `@ag-ui/client`, `rxjs` |

## Common Patterns

### Custom Prefix

Avoid tool name collisions by adding a custom prefix to all tools from a specific adapter:

```typescript
const adapter = new AIAdapter(client, {
  prefix: 'myapp'  // Tools named: myapp_search, myapp_fetch, etc.
});
```

### Human-in-the-Loop Tool Approval

Gate sensitive tool calls behind a user prompt by passing a `needsApproval` callback. The default behavior requires approval for any tool whose schema sets the `destructiveHint` annotation.

```typescript
const adapter = new AIAdapter(client, {
  needsApproval: (tool, args) => tool.annotations?.destructiveHint === true,
});
```

See the [AI SDK adapter guide](/ai-adapters/ai-sdk) for an end-to-end example.

### Single Client vs. Multi-Session

Adapters work with both individual `MCPClient` instances andaggregated `MultiSessionClient`.

#### Single Client
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

#### Multi-Session
```typescript
const client = new MultiSessionClient('user_123');

// Connect to multiple servers
await client.connect();

// Get all tools from all currently connected servers
const adapter = new AIAdapter(client);
const tools = await adapter.getTools();
```

## Error Handling

All adapters handle disconnected clients gracefully:

```typescript
const adapter = new AIAdapter(client);
const tools = await adapter.getTools();
// Returns empty object/array if client is disconnected
```
