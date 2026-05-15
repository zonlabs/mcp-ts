---
title: "Vercel AI SDK"
sidebarTitle: "AI SDK"
description: "Use MCP tools with the Vercel AI SDK's streamText, generateText, and useChat, including human-in-the-loop approvals for destructive calls."
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

## Human-in-the-loop approvals

Use the `needsApproval` option to require explicit user confirmation before a tool runs. The callback receives the tool definition and the arguments the model wants to call it with, and returns `true` to gate the call behind the AI SDK's approval flow.

```typescript
const adapter = new AIAdapter(client, {
  needsApproval: (tool, args) => {
    // Always confirm before deleting anything
    if (tool.name.startsWith('delete_')) return true;
    // Or read approval state from your app
    return tool.annotations?.destructiveHint === true;
  },
});

const tools = await adapter.getTools();
```

When `needsApproval` is not provided, the adapter falls back to the tool's [`destructiveHint`](/reference/types) annotation: tools marked destructive require approval, all others run immediately. Set `needsApproval: () => false` to opt out entirely.

When you pair the adapter with a [`ToolRouter`](/core-concepts/tool-router), the same logic runs against the *target* tool resolved by `mcp_execute_tool`. Approvals then respect the underlying tool's annotations rather than the meta-tool wrapper.

## API Reference

The `AIAdapter` constructor accepts the following options:

- `prefix`: (Optional) String prefix for all tool names.
- `toolRouter`: (Optional) A `ToolRouter` instance for dynamic tool discovery.
- `needsApproval`: (Optional) `(tool, args) => boolean | Promise<boolean>` callback that decides whether a tool call requires user approval. Defaults to checking `tool.annotations.destructiveHint`.

See the [AIAdapter API Reference](/reference/server#adapters) for more details.
