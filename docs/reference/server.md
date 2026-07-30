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
  transportType?: 'sse' | 'streamable-http',
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
