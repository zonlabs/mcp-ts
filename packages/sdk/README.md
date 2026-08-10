# @mcp-ts/sdk

Core TypeScript SDK for building MCP applications.

```bash
npm install @mcp-ts/sdk
```

## Entry Points

- `@mcp-ts/sdk/server`: server-side handlers, `MCPClient`, `MultiSessionClient`, storage exports.
- `@mcp-ts/sdk/client`: browser RPC client primitives.
- `@mcp-ts/sdk/client/react`: React hooks and MCP Apps helpers.
- `@mcp-ts/sdk/client/vue`: Vue composables.
- `@mcp-ts/sdk/shared`: shared RPC/event/types utilities.

## MCP SDK v2

The package uses `@modelcontextprotocol/client` and `@modelcontextprotocol/core`.
Server-side clients default SDK protocol negotiation to `{ mode: 'auto' }`, persist Cloudflare-style server options on sessions, and leave SDK capabilities fully caller-owned.

```typescript
import { createNextMcpHandler } from '@mcp-ts/sdk/server';

export const { POST } = createNextMcpHandler({
  clientDefaults: {
    client: {
      capabilities: { sampling: {} },
      inputRequired: { autoFulfill: true },
      cachePartition: 'user-id',
      defaultCacheTtlMs: 30000,
    },
  },
});
```

See [MCP SDK v2 Protocol Support](../../docs/mcp-v2-protocol.md) for the implementation checklist, persisted metadata behavior, response cache notes, and SSE compatibility status.

See the [main README](https://github.com/zonlabs/mcp-ts) for full documentation, quick start, and architecture details.
