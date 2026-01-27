---
sidebar_position: 5
---

# API Reference

Complete API documentation for mcp-ts.

## Server-Side API

### `createNextMcpHandler(options)`

Creates handlers for Next.js App Router API routes.

```typescript
import { createNextMcpHandler } from '@mcp-ts/sdk/server';

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
import { createSSEHandler } from '@mcp-ts/sdk/server';

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
import { MCPClient } from '@mcp-ts/sdk/server';

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

**`getAITools(): Promise<ToolSet>`**

Get all MCP tools and convert them to AI SDK compatible tools.

```typescript
const tools = await client.getAITools();
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

### `MultiSessionClient`

Manages multiple MCP connections for a single user identity, allowing aggregation of tools from all connected servers.

```typescript
import { MultiSessionClient } from '@mcp-ts/sdk/server';

const mcp = new MultiSessionClient(identity, {
  timeout: 15000,
  maxRetries: 2,
  retryDelay: 1000,
});
```

**Options:**
- `timeout` - Connection timeout in milliseconds (default: 15000)
- `maxRetries` - Maximum number of retry attempts for each session (default: 2)
- `retryDelay` - Delay between retries in milliseconds (default: 1000)

#### Methods

**`connect(): Promise<void>`**

Connects to all active sessions for the user. Skips sessions that fail to connect after retries, but logs errors.

```typescript
await mcp.connect();
```

---

**`getClients(): MCPClient[]`**

Returns the array of currently connected clients.

```typescript
const clients = mcp.getClients();
```

---

**`disconnect(): void`**

Disconnects all active clients and clears the internal client list.

```typescript
mcp.disconnect();
```

---


### Adapters

Adapters convert MCP tools into framework-specific formats for seamless integration with AI frameworks.

#### `AIAdapter`

Convert MCP tools to Vercel AI SDK format.

```typescript
import { AIAdapter } from '@mcp-ts/sdk/adapters/ai';

const adapter = new AIAdapter(client: MCPClient | MultiSessionClient, options?: {
  prefix?: string  // Tool name prefix (default: serverId)
});

const tools = await adapter.getTools(); // Returns ToolSet
```

#### `LangChainAdapter`

Convert MCP tools to LangChain DynamicStructuredTool format.

```typescript
import { LangChainAdapter } from '@mcp-ts/sdk/adapters/langchain';

const adapter = new LangChainAdapter(client: MCPClient | MultiSessionClient, options?: {
  prefix?: string           // Tool name prefix
  simplifyErrors?: boolean  // Return simple error strings (default: false)
});

const tools = await adapter.getTools(); // Returns DynamicStructuredTool[]
```

#### `MastraAdapter`

Convert MCP tools to Mastra tool format.

```typescript
import { MastraAdapter } from '@mcp-ts/sdk/adapters/mastra';

const adapter = new MastraAdapter(client: MCPClient | MultiSessionClient, options?: {
  prefix?: string  // Tool name prefix
});

const tools = await adapter.getTools(); // Returns MastraTool[]
```

#### `CopilotKitAdapter`

Convert MCP tools to CopilotKit actions.

```typescript
import { CopilotKitAdapter } from '@mcp-ts/sdk/adapters/copilotkit';

const adapter = new CopilotKitAdapter(client: MCPClient | MultiSessionClient, options?: {
  prefix?: string  // Action name prefix
});

const actions = await adapter.getActions(); // Returns CopilotKitAction[]
```

## Storage Backend API

### `storage`

Global storage instance that automatically selects the appropriate backend based on environment configuration.

```typescript
import { storage } from '@mcp-ts/sdk/server';
```

#### Configuration

The storage backend is selected automatically:

```bash
# Redis (Production)
MCP_TS_STORAGE_TYPE=redis
REDIS_URL=redis://localhost:6379

# File System (Development)
MCP_TS_STORAGE_TYPE=file
MCP_TS_STORAGE_FILE=./sessions.json

# In-Memory (Testing - Default)
MCP_TS_STORAGE_TYPE=memory
```

---

### Storage Methods

**`generateSessionId(): string`**

Generate a unique session ID.

```typescript
const sessionId = storage.generateSessionId();
```

---

**`createSession(session: SessionData): Promise<void>`**

Create a new session. Throws if session already exists.

```typescript
await storage.createSession({
  sessionId: 'abc123',
  identity: 'user-123',
  serverId: 'server-id',
  serverName: 'My Server',
  serverUrl: 'https://mcp.example.com',
  callbackUrl: 'https://myapp.com/callback',
  transportType: 'sse',
  active: true,
  createdAt: Date.now(),
});
```

---

**`updateSession(identity: string, sessionId: string, data: Partial<SessionData>): Promise<void>`**

Update an existing session with partial data. Throws if session doesn't exist.

```typescript
await storage.updateSession('user-123', 'abc123', {
  active: false,
  tokens: {
    access_token: 'new-token',
    token_type: 'Bearer',
  },
});
```

---

**`getSession(identity: string, sessionId: string): Promise<SessionData | null>`**

Retrieve session data.

```typescript
const session = await storage.getSession('user-123', 'abc123');
```

---

**`getIdentitySessionsData(identity: string): Promise<SessionData[]>`**

Get all session data for an identity.

```typescript
const sessions = await storage.getIdentitySessionsData('user-123');
```

---

**`getIdentityMcpSessions(identity: string): Promise<string[]>`**

Get all session IDs for an identity.

```typescript
const sessionIds = await storage.getIdentityMcpSessions('user-123');
```

---

**`removeSession(identity: string, sessionId: string): Promise<void>`**

Delete a session.

```typescript
await storage.removeSession('user-123', 'abc123');
```

---

**`getAllSessionIds(): Promise<string[]>`**

Get all session IDs across all users (admin operation).

```typescript
const allSessions = await storage.getAllSessionIds();
```

---

**`clearAll(): Promise<void>`**

Clear all sessions (admin operation).

```typescript
await storage.clearAll();
```

---

**`cleanupExpiredSessions(): Promise<void>`**

Clean up expired sessions (Redis only, no-op for others).

```typescript
await storage.cleanupExpiredSessions();
```

---

**`disconnect(): Promise<void>`**

Disconnect from storage backend.

```typescript
await storage.disconnect();
```

---

### Custom Storage Backends

You can also use specific storage backends directly:

```typescript
import { 
  RedisStorageBackend,
  MemoryStorageBackend,
  FileStorageBackend 
} from '@mcp-ts/sdk/server';
import { Redis } from 'ioredis';

// Redis
const redis = new Redis(process.env.REDIS_URL);
const redisStorage = new RedisStorageBackend(redis);

// File System
const fileStorage = new FileStorageBackend({ path: './sessions.json' });
await fileStorage.init();

// In-Memory
const memoryStorage = new MemoryStorageBackend();
```

---

## Client-Side API

### `useMcp(options)`

React hook for managing MCP connections.

```typescript
import { useMcp } from '@mcp-ts/sdk/client';

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
import { SSEClient } from '@mcp-ts/sdk/client';

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
} from '@mcp-ts/sdk/shared';

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
import type { ToolInfo } from '@mcp-ts/sdk/shared';

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
  identity?: string;
  serverId?: string;
  serverName?: string;
  serverUrl: string;
  callbackUrl: string;
  transportType: 'sse' | 'streamable_http';
  active: boolean;
  createdAt: number;
  headers?: Record<string, string>;
  // OAuth data
  tokens?: OAuthTokens;
  clientInformation?: OAuthClientInformation;
  codeVerifier?: string;
  clientId?: string;
}
```

## Error Handling

### UnauthorizedError

Thrown when OAuth authorization is required.

```typescript
import { UnauthorizedError } from '@mcp-ts/sdk/server';

try {
  await client.connect();
} catch (error) {
  if (error instanceof UnauthorizedError) {
    console.log('Redirect to:', error.authUrl);
  }
}
```

## Next Steps

- [Examples](https://github.com/zonlabs/mcp-ts/tree/main/examples) - Practical code examples
- [GitHub Repository](https://github.com/zonlabs/mcp-ts) - Source code
