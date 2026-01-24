---
sidebar_position: 5
---

# API Reference

Complete API documentation for mcp-ts.

## Server-Side API

### `createNextMcpHandler(options)`

Creates handlers for Next.js App Router API routes.

```typescript
import { createNextMcpHandler } from '@mcp-ts/redis/server';

const { GET, POST } = createNextMcpHandler({
  getIdentity: (request) => string,
  getAuthToken?: (request) => string | null,
  authenticate?: (identity, token) => Promise<boolean>,
  heartbeatInterval?: number,
});
```

**Options:**
- `getIdentity` - Function to extract identity from request (required)
- `getAuthToken` - Function to extract auth token from request (optional)
- `authenticate` - Custom authentication logic (optional)
- `heartbeatInterval` - SSE heartbeat interval in ms (default: 30000)
- `clientDefaults` - Static OAuth client metadata (optional)
- `getClientMetadata` - Dynamic OAuth metadata getter (optional, overrides defaults)

**Returns:** `{ GET, POST }` - HTTP method handlers

---

### `createSSEHandler(options)`

Creates an SSE handler for standard Node.js/Express applications.

```typescript
import { createSSEHandler } from '@mcp-ts/redis/server';

const handler = createSSEHandler({
  identity: string,
  onAuth?: (identity) => Promise<boolean>,
  heartbeatInterval?: number,
});
```

**Options:**
- `identity` - User/Client identifier (required)
- `onAuth` - Authentication callback (optional)
- `heartbeatInterval` - Heartbeat interval in ms (default: 30000)
- `clientDefaults` - Static OAuth client metadata (optional)
- `getClientMetadata` - Dynamic OAuth metadata getter (optional)

**Returns:** Request handler function

---

### `MCPClient`

Direct MCP client class for server-side operations.

```typescript
import { MCPClient } from '@mcp-ts/redis/server';

const client = new MCPClient({
  identity: string,
  sessionId: string,
  serverId?: string,
  serverUrl?: string,
  callbackUrl?: string,
  transportType?: 'sse' | 'streamable_http',
  onRedirect?: (authUrl: string) => void,
  // OAuth Metadata
  clientName?: string,
  clientUri?: string,
  logoUri?: string,
  policyUri?: string,
});
```

#### Methods

**`connect(): Promise<void>`**

Connect to the MCP server. May throw `UnauthorizedError` if OAuth is required.

```typescript
await client.connect();
```

---

**`disconnect(): Promise<void>`**

Disconnect from the MCP server.

```typescript
await client.disconnect();
```

---

**`listTools(): Promise<ListToolsResult>`**

List available tools from the MCP server.

```typescript
const { tools } = await client.listTools();
```

---

**`callTool(name: string, args: object): Promise<CallToolResult>`**

Call a tool with arguments.

```typescript
const result = await client.callTool('get_weather', {
  location: 'San Francisco',
});
```

---

**`listPrompts(): Promise<ListPromptsResult>`**

List available prompts.

```typescript
const { prompts } = await client.listPrompts();
```

---

**`getPrompt(name: string, args?: object): Promise<GetPromptResult>`**

Get a prompt with optional arguments.

```typescript
const prompt = await client.getPrompt('code-review', {
  language: 'typescript',
});
```

---

**`listResources(): Promise<ListResourcesResult>`**

List available resources.

```typescript
const { resources } = await client.listResources();
```

---

**`readResource(uri: string): Promise<ReadResourceResult>`**

Read a specific resource by URI.

```typescript
const resource = await client.readResource('file:///path/to/file');
```

---

**`finishAuth(code: string): Promise<void>`**

Complete OAuth authorization with authorization code.

```typescript
await client.finishAuth(authCode);
```

---

### `sessionStore`

Redis-backed session storage utilities.

```typescript
import { sessionStore } from '@mcp-ts/redis/server';
```

**`generateSessionId(): string`**

Generate a new session ID.

```typescript
const sessionId = sessionStore.generateSessionId();
```

---

**`saveSession(session: SessionData): Promise<void>`**

Save session data to Redis.

```typescript
await sessionStore.saveSession({
  sessionId: 'abc123',
  identity: 'user-123',
  serverId: 'server-id',
  serverName: 'My Server',
  serverUrl: 'https://mcp.example.com',
  callbackUrl: 'https://myapp.com/callback',
  transportType: 'sse' | 'streamable_http',
  active: true,
});
```

---

**`getSession(sessionId: string): Promise<SessionData | null>`**

Retrieve session data from Redis.

```typescript
const session = await sessionStore.getSession('abc123');
```

---

**`deleteSession(sessionId: string): Promise<void>`**

Delete session from Redis.

```typescript
await sessionStore.deleteSession('abc123');
```

---

**`getIdentitySessions(identity: string): Promise<string[]>`**

Get all session IDs for an identity.

```typescript
const sessionIds = await sessionStore.getIdentitySessions('user-123');
```

---

## Client-Side API

### `useMcp(options)`

React hook for managing MCP connections.

```typescript
import { useMcp } from '@mcp-ts/redis/client';

const {
  connections,
  status,
  isInitializing,
  connect,
  disconnect,
  refresh,
  connectSSE,
  disconnectSSE,
  finishAuth,
  callTool,
  listTools,
  listPrompts,
  getPrompt,
  listResources,
  readResource,
  getConnection,
  getConnectionByServerId,
  isServerConnected,
  getTools,
} = useMcp({
  url: string,
  identity: string,
  authToken?: string,
  autoConnect?: boolean,
  autoInitialize?: boolean,
  onConnectionEvent?: (event) => void,
  onLog?: (level, message, metadata) => void,
});
```

**Options:**
- `url` - SSE endpoint URL (required)
- `identity` - User/Client identifier (required)
- `authToken` - Authentication token (optional)
- `autoConnect` - Auto-connect SSE on mount (default: true)
- `autoInitialize` - Auto-load sessions on mount (default: true)
- `onConnectionEvent` - Connection event handler (optional)
- `onLog` - Debug log handler (optional)

**Returns:** Object with state and methods

---

### `SSEClient`

Lower-level SSE client for custom implementations.

```typescript
import { SSEClient } from '@mcp-ts/redis/client';

const client = new SSEClient({
  url: string,
  identity: string,
  authToken?: string,
  onConnectionEvent?: (event) => void,
  onStatusChange?: (status) => void,
  onLog?: (level, message, metadata) => void,
});
```

#### Methods

**`connect(): void`**

Connect to the SSE endpoint.

```typescript
client.connect();
```

---

**`disconnect(): void`**

Disconnect from the SSE endpoint.

```typescript
client.disconnect();
```

---

**`getSessions(): Promise<Session[]>`**

Get all user sessions.

```typescript
const sessions = await client.getSessions();
```

---

**`connectToServer(config): Promise<{ sessionId: string }>`**

Connect to an MCP server.

```typescript
const { sessionId } = await client.connectToServer({
  serverId: 'server-id',
  serverName: 'My Server',
  serverUrl: 'https://mcp.example.com',
  callbackUrl: window.location.origin + '/callback',
});
```

---

**`disconnectFromServer(sessionId: string): Promise<void>`**

Disconnect from an MCP server.

```typescript
await client.disconnectFromServer(sessionId);
```

---

**`callTool(sessionId, name, args): Promise<any>`**

Call a tool on a connected server.

```typescript
const result = await client.callTool(sessionId, 'tool_name', {
  arg1: 'value',
});
```

---

**`listTools(sessionId): Promise<Tool[]>`**

List tools for a session.

```typescript
const tools = await client.listTools(sessionId);
```

---

## Types

### Connection Types

```typescript
import type {
  McpConnectionState,
  McpConnectionEvent,
} from '@mcp-ts/redis/shared';

type McpConnectionState =
  | 'DISCONNECTED'
  | 'CONNECTING'
  | 'AUTHENTICATING'
  | 'AUTHENTICATED'
  | 'DISCOVERING'
  | 'CONNECTED'
  | 'VALIDATING'
  | 'RECONNECTING'
  | 'FAILED';

type McpConnectionEvent =
  | { type: 'state_changed'; sessionId: string; state: McpConnectionState; ... }
  | { type: 'tools_discovered'; sessionId: string; tools: Tool[]; ... }
  | { type: 'auth_required'; sessionId: string; authUrl: string; ... }
  | { type: 'error'; sessionId: string; error: string; ... }
  | { type: 'disconnected'; sessionId: string; reason?: string; ... }
  | { type: 'progress'; sessionId: string; message: string; ... };
```

### Tool Types

```typescript
import type { ToolInfo } from '@mcp-ts/redis/shared';

interface ToolInfo {
  name: string;
  description?: string;
  inputSchema: {
    type: 'object';
    properties?: Record<string, any>;
    required?: string[];
  };
}
```

### Session Types

```typescript
interface SessionData {
  sessionId: string;
  identity: string;
  serverId: string;
  serverName: string;
  serverUrl: string;
  callbackUrl: string;
  transportType: 'sse' | 'streamable_http';
  active: boolean;
  tokens?: OAuthTokens;
  clientInformation?: OAuthClientInformation;
}
```

## Error Handling

### UnauthorizedError

Thrown when OAuth authorization is required.

```typescript
import { UnauthorizedError } from '@mcp-ts/redis/server';

try {
  await client.connect();
} catch (error) {
  if (error instanceof UnauthorizedError) {
    console.log('Redirect to:', error.authUrl);
  }
}
```

## Next Steps

- [Examples](https://github.com/ashen-dusk/mcp-ts/tree/main/examples) - Practical code examples
- [GitHub Repository](https://github.com/ashen-dusk/mcp-ts) - Source code
