---
title: "Mastra"
sidebarTitle: "Mastra"
description: "High-performance MCP integration for the Mastra framework."
---

The `MastraAdapter` converts MCP tools into the format expected by the [Mastra](https://mastra.ai) framework.

## Installation

```bash
npm install @mcp-ts/sdk zod
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

## API Reference

See the [MastraAdapter API Reference](/reference/server#adapters) for more details.
