---
title: "Tool Router API"
sidebarTitle: "Tool Router"
description: "API reference for the Tool Router middleware: configuration, meta-tools, search scoring options, and runtime hooks for managing large MCP tool catalogs."
icon: "route"
---

Instead of injecting all tools at once, you can let the LLM discover and load tools on-demand using BM25 or semantic search.

### `ToolRouter`

```typescript
import { ToolRouter } from '@mcp-ts/sdk/shared';
import { embed } from 'ai';
import { openai } from '@ai-sdk/openai';

const router = new ToolRouter(client: MCPClient | MultiSessionClient, {
  // 'all' (default), 'search' (exposes meta-tools only), or 'groups'
  strategy: 'search',
  
  // Max tools to return from a search or group (default: 40)
  maxTools: 5,
  
  // Optional embedding function for semantic search
  embedFn: async (texts) => {
    const { embeddings } = await embed({
      model: openai.embedding('text-embedding-3-small'),
      values: texts,
    });
    return embeddings;
  },
  
  // Weight between keyword (BM25) and embedding search (0 to 1, default: 0.4)
  keywordWeight: 0.4,
});
```

**Methods:**
- `getFilteredTools()` - Get tools based on current strategy
- `searchTools(query, topK?, options?)` - Search via BM25 + embeddings, optionally scoped by exact `serverId` or fragment-based `serverName`
- `searchToolsRegex(pattern, topK?)` - Search via regex pattern
- `listServers(options?)` - List connected indexed servers with tool counts
- `listTools(options?)` - Deterministically list indexed tools, optionally scoped by server and paginated with `cursor`
- `refresh()` - Re-index tools from all connected clients
- `setStrategy(strategy)` - Change tool selection strategy at runtime

Use the ToolRouter with adapters like `AIAdapter`:

```typescript
const adapter = new AIAdapter(client, {
  toolRouter: router
});
const tools = await adapter.getTools();
```

### `ToolIndex`

Lightweight in-memory search index used internally by `ToolRouter`, or directly for specific custom discovery flows.

```typescript
import { ToolIndex } from '@mcp-ts/sdk/shared';

const index = new ToolIndex({
  embedFn: async (texts) => [/* ... */],
  keywordWeight: 0.4
});

await index.buildIndex(tools);

// Returns ToolSummary[] using BM25 and explicit/optional embeddings
const results = await index.search("query", 5);

// Regex search
const regexResults = index.searchRegex("get_.*_data", 5);

// Search one server by human-readable name fragment.
// This matches a server named "Database MCP".
const databaseResults = await index.search("tables", 5, {
  serverName: "database",
});

// Search one server by exact stable ID.
const exactServerResults = await index.search("tables", 5, {
  serverId: "database-server",
});

// List every tool from one server with pagination metadata.
const listed = index.listTools({
  serverName: "database",
  limit: 100,
});
console.log(listed.totalCount, listed.tools);
```

### `SchemaCompressor`

Utility for yielding compact tool representations (name + description + inline parameterHint) without the full `inputSchema`.

```typescript
import { SchemaCompressor } from '@mcp-ts/sdk/shared';

// Get a compact schema omitting full `inputSchema`
const compact = SchemaCompressor.toCompact(tool);
```
