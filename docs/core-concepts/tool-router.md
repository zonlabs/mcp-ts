---
title: "Tool Router"
sidebarTitle: "Tool Router"
description: "Learn how the mcp-ts Tool Router middleware manages large MCP tool catalogs, routes tool calls intelligently, and keeps LLM context windows lean."
---

The **Tool Router** is a powerful middleware layer in `mcp-ts` designed to solve the problem of "context window bloat." 

When you connect to multiple MCP servers, the total number of tools can easily exceed 50 or 100. Injecting the full JSON schema for every tool into an LLM's context window is expensive, slow, and can lead to degraded model performance.

The `ToolRouter` sits between your AI adapter and your MCP clients, allowing you to control exactly how and when tools are exposed to the model.

## How It Works

By default, the `ToolRouter` provides **On-Demand Tool Discovery**: instead of injecting dozens or hundreds of tool schemas into the LLM context, it exposes a minimal set of system **Meta-Tools** (`mcp_search_tools`, `mcp_get_tool_schema`, `mcp_execute_tool`, `mcp_list_servers`, `mcp_search_tool_regex`). 

The LLM discovers tools dynamically via search and fetches schemas only when needed.

If certain high-frequency tools should always be immediately visible in the prompt without requiring search lookup, you can pass them in `pinnedTools`.

---

## Basic Usage

To use the `ToolRouter`, initialize it with your `McpManager` and pass it to your adapter (e.g. `AIAdapter`).

```typescript
import { McpManager } from "@mcp-ts/client";
import { AIAdapter } from "@mcp-ts/client/adapters/ai";

export async function createMcpAgent(userId: string = "user-123") {
  const client = new McpManager(userId);
  await client.connect();

  // Dynamic import for ToolRouter (shared SDK utility)
  const { ToolRouter } = await import("@mcp-ts/client/shared");
  
  // Configure the router with pinned tools that are always directly visible
  const router = new ToolRouter(client, { pinnedTools: ["slack_send_message"] });
  
  // Initialize the adapter with the router
  const adapter = new AIAdapter(client, { toolRouter: router });
  
  // Expose the tools to your AI framework (e.g. Vercel AI SDK)
  const tools = await adapter.getTools();
  
  return tools;
}
```

## Options Reference

| Property | Type | Default | Description |
| :-- | :-- | :-- | :-- |
| `pinnedTools` | `string[]` | `[]` | Tools to expose directly alongside meta-tools without search lookup. |
| `maxTools` | `number` | `40` | Maximum tools to return in search results. |
| `compactSchemas`| `boolean` | `false` | Strips inputSchemas from all tools to save space. |

---

## Advanced: Semantic Search

By default, the `ToolRouter` uses keyword-based BM25 matching. For even better results, you can provide an `embedFn` to enable semantic search.

```typescript
const router = new ToolRouter(client, {
  pinnedTools: ['slack_send_message'],
  embedFn: async (text) => {
    // Return embeddings from OpenAI, Voyage, etc.
    return await getEmbeddings(text);
  }
});
```
