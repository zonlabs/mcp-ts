---
title: "Vercel AI SDK"
sidebarTitle: "AI SDK"
description: "Convert MCP tools into Vercel AI SDK tool definitions with the AIAdapter so you can call MCP servers directly from generateText, streamText, and agents."
---

The `AIAdapter` converts MCP tools into the format expected by the [Vercel AI SDK](https://sdk.vercel.ai/docs). This allows you to use MCP tools with functions like `streamText`, `generateText`, and `useChat`.

## Installation

```bash
npm install @mcp-ts/sdk ai
```

## Usage

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

## API reference

The `AIAdapter` constructor accepts the following options:

- `prefix`: (Optional) String prefix for all tool names.
- `toolRouter`: (Optional) A `ToolRouter` instance for dynamic tool discovery.

See the [AIAdapter API Reference](/reference/server#adapters) for more details.
