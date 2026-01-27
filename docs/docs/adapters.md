# Adapters

import { IoSparkles } from "react-icons/io5";

Adapters transforms MCP tools into framework-specific formats for seamless integration with AI frameworks.

---

## Available Adapters

| Adapter | Framework | Import Path | Dependencies |
|---------|-----------|-------------|--------------|
| <IoSparkles size={20} color="black" style={{ verticalAlign: 'middle' }} /> **AI SDK** | Vercel AI SDK | `@mcp-ts/sdk/adapters/ai` | `ai` |
| ![LangChain](/img/agent-framework/langchain.svg) **LangChain** | LangChain | `@mcp-ts/sdk/adapters/langchain` | `@langchain/core`, `zod` |
| ![Mastra](/img/agent-framework/mastra.svg) **Mastra** | Mastra | `@mcp-ts/sdk/adapters/mastra` | `zod` |
| ![CopilotKit](/img/agent-framework/copilotkit.svg) **CopilotKit** | CopilotKit | `@mcp-ts/sdk/adapters/copilotkit` | `@copilotkit/runtime` |

---

<h2><IoSparkles size={24} color="black" style={{ verticalAlign: 'middle', marginRight: '10px', display: 'inline' }} /> AI SDK Adapter</h2>

Convert MCP tools to Vercel AI SDK format.

### Installation

```bash
npm install @mcp-ts/sdk ai
```

### Usage

```typescript
import { MultiSessionClient } from '@mcp-ts/sdk/server';
import { AIAdapter } from '@mcp-ts/sdk/adapters/ai';
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';

const client = new MultiSessionClient('user_123');
await client.connect();

const adapter = new AIAdapter(client);
const tools = await adapter.getTools();

const result = await streamText({
  model: openai('gpt-4'),
  tools,
  prompt: 'Search for TypeScript tutorials'
});
```

### API

See [API Reference](./api-reference.md#aiadapter).

---

<h2><img src="/mcp-ts/img/agent-framework/langchain.svg" height="24" style={{ verticalAlign: 'middle', marginRight: '10px', display: 'inline' }} /> LangChain Adapter</h2>

Convert MCP tools to LangChain DynamicStructuredTool format.

### Installation

```bash
npm install @mcp-ts/sdk @langchain/core zod
```

### Usage

```typescript
import { MultiSessionClient } from '@mcp-ts/sdk/server';
import { LangChainAdapter } from '@mcp-ts/sdk/adapters/langchain';

const client = new MultiSessionClient('user_123');
await client.connect();

const adapter = new LangChainAdapter(client);
const tools = await adapter.getTools();

// Use with LangChain agent
const agent = createReactAgent({
  llm,
  tools,
  // ...
});
```

### API

See [API Reference](./api-reference.md#langchainadapter).

---

<h2><img src="/mcp-ts/img/agent-framework/mastra.svg" height="24" style={{ verticalAlign: 'middle', marginRight: '10px', display: 'inline' }} /> Mastra Adapter</h2>

Convert MCP tools to Mastra tool format.

### Installation

```bash
npm install @mcp-ts/sdk zod
```

### Usage

```typescript
import { MultiSessionClient } from '@mcp-ts/sdk/server';
import { MastraAdapter } from '@mcp-ts/sdk/adapters/mastra';

const client = new MultiSessionClient('user_123');
await client.connect();

const adapter = new MastraAdapter(client);
const tools = await adapter.getTools();

// Use with Mastra agent
const agent = new Agent({
  tools,
  // ...
});
```

### API

See [API Reference](./api-reference.md#mastraadapter).

---

<h2><img src="/mcp-ts/img/agent-framework/copilotkit.svg" height="24" style={{ verticalAlign: 'middle', marginRight: '10px', display: 'inline' }} /> CopilotKit Adapter</h2>

Convert MCP tools to CopilotKit actions.

### Installation

```bash
npm install @mcp-ts/sdk @copilotkit/runtime
```

### Usage

```typescript
// app/api/copilotkit/route.ts
import { MultiSessionClient } from '@mcp-ts/sdk/server';
import { CopilotKitAdapter } from '@mcp-ts/sdk/adapters/copilotkit';
import { CopilotRuntime, OpenAIAdapter, copilotRuntimeNextJSAppRouterEndpoint } from '@copilotkit/runtime';

export const POST = async (req: Request) => {
  const client = new MultiSessionClient('user_123');
  await client.connect();
  
  const adapter = new CopilotKitAdapter(client);
  const actions = await adapter.getActions();
  
  const runtime = new CopilotRuntime({ actions });
  
  const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
    runtime,
    serviceAdapter: new OpenAIAdapter(),
    endpoint: '/api/copilotkit',
  });

  return handleRequest(req);
};
```

### API

See [API Reference](./api-reference.md#copilotkitadapter).

---

## Common Patterns

### Custom Prefix

Avoid tool name collisions:

```typescript
const adapter = new AIAdapter(client, {
  prefix: 'myapp'  // Tools named: myapp_search, myapp_fetch, etc.
});
```

### Single Client

Use with individual MCP client:

```typescript
import { MCPClient } from '@mcp-ts/sdk/server';

const client = new MCPClient({
  identity: 'user_123',
  sessionId: 'session_abc',
  serverUrl: 'https://mcp-server.com',
  callbackUrl: 'https://myapp.com/callback'
});

await client.connect();
const adapter = new AIAdapter(client);
```

### Multi-Session

Aggregate tools from multiple MCP servers:

```typescript
const client = new MultiSessionClient('user_123');

// Connect to multiple servers
await client.connect('server1', 'https://server1.com');
await client.connect('server2', 'https://server2.com');

// Get all tools from all servers
const adapter = new AIAdapter(client);
const tools = await adapter.getTools();
```

---

## Error Handling

All adapters handle disconnected clients gracefully:

```typescript
const adapter = new AIAdapter(client);
const tools = await adapter.getTools();
// Returns empty object/array if client is disconnected
```

LangChain adapter supports simplified errors:

```typescript
const adapter = new LangChainAdapter(client, {
  simplifyErrors: true  // Returns error.message instead of full error object
});
```
