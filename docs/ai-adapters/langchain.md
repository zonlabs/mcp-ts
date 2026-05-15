---
title: "LangChain"
sidebarTitle: "LangChain"
description: "Convert MCP tools into LangChain DynamicStructuredTool format so your agents can call any MCP server with typed Zod schemas and clean errors."
---

The `LangChainAdapter` converts MCP tools into LangChain's `DynamicStructuredTool` format.

## Installation

```bash
npm install @mcp-ts/sdk @langchain/core zod
```

### Optional: typed tool schemas

The adapter converts each tool's JSON Schema into a Zod schema using `json-schema-to-zod`. Install it to get accurate per-tool validation:

```bash
npm install json-schema-to-zod
```

Without it, the adapter falls back to a permissive `z.record(z.any())` schema and logs a one-time warning. Tools still work — you just lose argument-level type checking.

## Usage

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

## Configuration

The `LangChainAdapter` supports simplified error messages, which can be useful for LLMs to better understand failures:

```typescript
const adapter = new LangChainAdapter(client, {
  simplifyErrors: true  // Returns error.message instead of full error object
});
```

## API Reference

See the [LangChainAdapter API Reference](/reference/server#adapters) for more details.
