---
title: "Server-Side API"
sidebarTitle: "Server-Side"
description: "API reference for mcp-ts server-side primitives, including MCPClient, MultiSessionClient, framework handlers, and session storage."
icon: "server"
---

### `createNextMcpHandler(options)`

Creates handlers for Next.js App Router API routes.

```typescript
import { createNextMcpHandler } from '@mcp-ts/client/server';

const { GET, POST } = createNextMcpHandler({
  getUserId?: (request) => string | null,
  getAuthToken?: (request) => string | null,
  authenticate?: (userId, token) => Promise<boolean> | boolean,
  heartbeatInterval?: number,
  clientDefaults?: ClientMetadata,
  getClientMetadata?: (request) => ClientMetadata | Promise<ClientMetadata>,
});
```

**Returns:** `{ GET, POST }`

---

### `createSSEHandler(options)`

Creates a Node.js-compatible handler for standard HTTP frameworks.

```typescript
import { createSSEHandler } from '@mcp-ts/client/server';

const handler = createSSEHandler({
  userId: string,
  onAuth?: (userId) => Promise<boolean>,
  heartbeatInterval?: number,
  clientDefaults?: ClientMetadata,
  getClientMetadata?: (request) => ClientMetadata | Promise<ClientMetadata>,
});
```

Mount the same handler for both the streamed `GET` endpoint and `POST` RPC calls.


#### `ClientMetadata`

`clientDefaults` and `getClientMetadata` can provide OAuth display metadata, a custom OAuth provider, and MCP SDK v2 client options:

```typescript
import type { McpSdkClientOptions } from '@mcp-ts/client/server';

interface ClientMetadata {
  clientName?: string;
  clientUri?: string;
  logoUri?: string;
  policyUri?: string;
  oauthProvider?: OAuthClientProvider;
  client?: McpSdkClientOptions;
}
```

Static `clientDefaults` and dynamic `getClientMetadata()` results are merged. Nested `client.capabilities`, `client.versionNegotiation`, and extension capability objects are merged instead of replaced wholesale; no capabilities are injected automatically.

#### MCP SDK v2 Options

`McpSdkClientOptions` is an allowlisted subset of the official SDK `ClientOptions`. `mcp-ts` defaults `versionNegotiation` to `{ mode: 'auto' }` and persists the serializable client option subset under `serverOptions.client` on sessions. Live objects such as `responseCacheStore` can be passed at runtime but are not persisted. Pass MCP Apps UI extension capabilities explicitly when needed.

```typescript
const client: McpSdkClientOptions = {
  versionNegotiation: { mode: 'auto' },
  capabilities: { sampling: {} },
  inputRequired: { autoFulfill: true },
  listMaxPages: 128,
  cachePartition: 'user-id',
  defaultCacheTtlMs: 30000,
};
```

When `transport` is omitted, Streamable HTTP is tried. Automatic SSE fallback is disabled; pass `transport: { type: 'sse' }` only when explicitly connecting to an SSE endpoint.

---

### `MCPClient`

Direct MCP client class for server-side operations.

```typescript
import { MCPClient } from '@mcp-ts/client/server';

const client = new MCPClient({
  userId: string,
  sessionId: string,
  serverId?: string,
  serverName?: string,
  serverUrl?: string,
  callbackUrl?: string,
  transport?: { type?: 'sse' | 'streamable-http' },
  serverOptions?: {
    client?: McpSdkClientOptions,
    transport?: { type?: 'sse' | 'streamable-http'; protocolVersion?: string },
    discoverResult?: DiscoverResult,
  } | null
  onRedirect?: (authUrl: string) => void,
  clientName?: string,
  clientUri?: string,
  logoUri?: string,
  policyUri?: string,
});
```

#### Common methods

- `connect(): Promise<void>`
- `disconnect(reason?: string): void`
- `listTools(): Promise<ListToolsResult>`
- `callTool(name, args): Promise<CallToolResult>`
- `listPrompts(): Promise<ListPromptsResult>`
- `getPrompt(name, args?): Promise<GetPromptResult>`
- `listResources(): Promise<ListResourcesResult>`
- `readResource(uri): Promise<ReadResourceResult>`
- `finishAuth(code, state?): Promise<void>`
- `getNegotiatedProtocolVersion(): string | undefined`
- `getProtocolEra(): 'legacy' | 'modern' | undefined`
- `getDiscoverResult(): DiscoverResult | undefined`

---

### `MultiSessionClient`

Manages multiple MCP connections for a single user.

```typescript
import { MultiSessionClient } from '@mcp-ts/client/server';

const mcp = new MultiSessionClient(userId, {
  timeout: 15000,
  maxRetries: 2,
  retryDelay: 1000,
});
```

#### Common methods

- `connect(): Promise<void>`
- `getClients(): MCPClient[]`
- `disconnect(): void`

---

### Session storage exports

```typescript
import {
  sessions,
  onSessionMutation,
  RedisStorageBackend,
  MemoryStorageBackend,
  FileStorageBackend,
  SqliteStorage,
  SupabaseStorageBackend,
  NeonStorageBackend,
} from '@mcp-ts/client/server';
```
