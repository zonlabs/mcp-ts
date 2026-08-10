---
title: "MCP SDK v2 Protocol Support"
sidebarTitle: "MCP SDK v2"
description: "How mcp-ts configures MCP SDK v2 protocol negotiation, server options, response cache options, and SSE behavior."
icon: "plug"
---

## What mcp-ts Does

`@mcp-ts/sdk` uses the MCP SDK v2 split packages, `@modelcontextprotocol/client` and `@modelcontextprotocol/core`.
Server-side clients normalize SDK options before constructing the official SDK `Client`:

```typescript
serverOptions: {
  client: {
    versionNegotiation: { mode: 'auto' },
  },
}
```

That default lets the SDK try the modern `server/discover` path and fall back inside the SDK to the legacy initialize handshake when the server is not modern-capable.

`mcp-ts` does not inject SDK capabilities on behalf of callers. If an application wants to advertise MCP Apps UI support, pass the official extension capability explicitly:

```typescript
serverOptions: {
  client: {
    capabilities: {
      extensions: {
        'io.modelcontextprotocol/ui': {
          mimeTypes: ['text/html+mcp'],
        },
      },
    },
  },
}
```

## Configuring SDK v2 Options

```typescript
import { createNextMcpHandler } from '@mcp-ts/sdk/server';

export const { POST } = createNextMcpHandler({
  clientDefaults: {
    clientName: 'My App',
    client: {
      capabilities: {
        sampling: {},
        roots: { listChanged: true },
      },
      inputRequired: { autoFulfill: true },
      listMaxPages: 128,
      cachePartition: 'tenant-or-user-id',
      defaultCacheTtlMs: 30000,
    },
  },
});
```

You only need to pass `versionNegotiation` when overriding the default:

```typescript
client: {
  versionNegotiation: { mode: 'legacy' },
}
```

or:

```typescript
client: {
  versionNegotiation: { mode: { pin: '2026-07-28' } },
}
```

## Stored Server Options

After a successful connection, `mcp-ts` records Cloudflare-style server options on the session:

```typescript
serverOptions: {
  client: {
    cachePartition: 'user-id',
    defaultCacheTtlMs: 30000,
  },
  transport: {
    type: 'streamable-http',
    protocolVersion: '2026-07-28',
  },
  discoverResult,
}
```

`discoverResult` is stored inside `serverOptions` so a restored modern connection can pass the prior discovery result back to the official SDK:

```typescript
await client.connect(transport, {
  prior: { kind: 'modern', discover: session.serverOptions.discoverResult },
});
```

The live `MCPClient` still exposes runtime protocol metadata:

```typescript
client.getProtocolEra();
client.getNegotiatedProtocolVersion();
client.getDiscoverResult();
```

## Response Cache Store

The official MCP SDK has a response cache used for cacheable MCP responses and derived views such as list results. If no cache store is provided, the SDK creates a fresh in-memory store per `Client` instance.

`mcp-ts` exposes the SDK knobs:

```typescript
client: {
  responseCacheStore: myStore,
  cachePartition: userId,
  defaultCacheTtlMs: 30000,
}
```

`responseCacheStore` itself is not persisted because it is a live object with methods. This matches the Cloudflare Agents pattern: persist serializable options such as `cachePartition` and `defaultCacheTtlMs`, but let the caller provide any custom cache store at runtime.

Use `cachePartition` when one cache store is shared across users or tenants. Public cache entries are keyed by server identity; private entries include the partition value.

## Transport Behavior

Automatic SSE fallback has been removed. When no transport is configured, `mcp-ts` tries Streamable HTTP only.

New code should use the Cloudflare-style nested transport object:

```typescript
await mcp.connect({
  serverUrl: 'https://example.com/mcp',
  transport: { type: 'streamable-http' },
});
```

Explicit SSE remains available only when the caller opts into it:

```typescript
await mcp.connect({
  serverUrl: 'https://legacy.example.com/sse',
  transport: { type: 'sse' },
});
```

`transportType` is no longer part of the server connection API.

## Remaining Caller-Owned Areas

- Custom `responseCacheStore` implementations are caller-owned.
- `inputRequired` can be passed to the SDK, but `mcp-ts` does not yet provide a first-class browser UX for multi-round input prompts.
- Existing SQL installs must apply the v2 server options migration before `serverOptions` can be stored.
