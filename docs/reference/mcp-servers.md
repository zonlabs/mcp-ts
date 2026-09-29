---
title: "MCP Servers Resource (client.mcpServers)"
sidebarTitle: "MCP Servers"
description: "API reference for client.mcpServers, providing CRUD operations, OAuth 2.1 discovery, and connection state management for MCP servers."
icon: "network-wired"
---

The `client.mcpServers` resource provides a high-level, standardized interface for creating, managing, and connecting Model Context Protocol (MCP) servers with durable storage and full OAuth 2.1 lifecycle support.

```typescript
import { client, createClient, SqliteStorage, RedisStorageBackend } from '@mcp-ts/client';

// Use the default singleton client
const servers = await client.mcpServers.find({ userId: 'user_123' });

// Or instantiate with an actual storage backend (SQLite, Redis, Supabase, Neon, File, Memory)
const appClient = createClient({
  storage: new SqliteStorage({ path: './mcp-servers.db' }),
});
```

---

## Methods

### `create(params)`

Registers and validates an MCP server for a given user. Auto-validates connectivity and authentication requirements during registration.

```typescript
const server = await client.mcpServers.create({
  name: 'Exa AI',
  url: 'https://mcp.exa.ai/mcp?login',
  userId: 'user_123',
  auth: {
    type: 'oauth',
    config: {
      clientMetadataUrl: 'https://myapp.com/oauth/client-metadata.json',
      scopes: ['mcp:tools'],
    },
  },
});
```

#### Parameters

<ParamField path="userId" type="string" required>
User or tenant identifier.
</ParamField>

<ParamField path="name" type="string" required>
Display name for the MCP server.
</ParamField>

<ParamField path="url" type="string" required>
URL endpoint of the MCP server (SSE or Streamable HTTP).
</ParamField>

<ParamField path="auth" type="McpServerAuthRequest">
Authentication configuration. Supports `none`, `bearer` (`token`),
`custom-headers` (`headers`), or `oauth` (`clientId`, `clientSecret`,
`clientMetadataUrl`, `scopes`).
</ParamField>

<ParamField path="description" type="string">
Optional description of the MCP server.
</ParamField>

<ParamField path="enabled" type="boolean" default="true">
Whether the server should be enabled. Disabled servers bypass connection
checks and return `status: { state: 'disconnected' }`.
</ParamField>

<ParamField path="serverId" type="string">
Optional custom identifier override. Defaults to a slugified name
(e.g. `exa_ai`) or an auto-generated ID.
</ParamField>

<ParamField path="callbackUrl" type="string">
Optional OAuth callback redirect URI.
</ParamField>

<ParamField path="toolPolicy" type="ToolPolicy">
Optional policy to restrict or allow specific tools
(`mode: 'all' | 'allowlist' | 'denylist'`, `toolIds: string[]`).
Defaults to allowing all tools.
</ParamField>

<ParamField path="metadata" type="Record<string, unknown>">
Arbitrary caller-supplied key-value metadata attached to this server.
</ParamField>

### `discoverOAuth(params)`

Inspects OAuth 2.1 metadata and endpoints for a target MCP server URL (RFC 8414 & RFC 9728) without modifying server state or creating a session.

```typescript
const info = await client.mcpServers.discoverOAuth({
  url: 'https://mcp.exa.ai/mcp?login',
});

if (info.supported) {
  console.log('Authorization URL:', info.authorizationUrl);
  console.log('Token URL:', info.tokenUrl);
  console.log('Scopes:', info.scopes);
  console.log('CIMD Supported:', info.clientIdMetadataDocumentSupported);
} else {
  console.log('Not OAuth:', info.error);
}
```

#### Parameters

<ParamField path="url" type="string" required>
  The MCP server URL endpoint to inspect.
</ParamField>

#### Returns: `Promise<McpServersDiscoverOAuthResponse>`

<ResponseField name="supported" type="boolean" required>
  Whether the MCP server implements OAuth 2.1.
</ResponseField>

<ResponseField name="authorizationUrl" type="string">
  Discovered authorization server endpoint.
</ResponseField>

<ResponseField name="tokenUrl" type="string">
  Discovered token exchange endpoint.
</ResponseField>

<ResponseField name="registrationUrl" type="string">
  Discovered Dynamic Client Registration (DCR) endpoint.
</ResponseField>

<ResponseField name="resourceUrl" type="string">
  Protected resource URL identifier as per RFC 9728.
</ResponseField>

<ResponseField name="scopes" type="string[]">
  Discovered OAuth scopes supported by the server.
</ResponseField>

<ResponseField name="clientIdMetadataDocumentSupported" type="boolean">
  Whether Client ID Metadata Documents (CIMD) are supported by the authorization server.
</ResponseField>

<ResponseField name="error" type="string">
  Descriptive error message when discovery fails or the server does not implement OAuth.
</ResponseField>

---

### `find(params)` / `list(params)`

Retrieves all MCP servers registered for a user, with optional search and state filtering.

```typescript
const response = await client.mcpServers.find({
  userId: 'user_123',
  enabled: true,
  search: 'search',
});
```

#### Parameters

<ParamField path="userId" type="string" required>
  User or tenant identifier.
</ParamField>

<ParamField path="enabled" type="boolean">
  Filter servers by enabled state.
</ParamField>

<ParamField path="search" type="string">
  Case-insensitive text search matching name, URL, or description.
</ParamField>

#### Returns: `Promise<McpServersFindResponse>`

```typescript
{
  object: 'list',
  data: McpServer[]
}
```

---

### `getById(params)` / `get(params)`

Retrieves a single MCP server by its unique identifier.

```typescript
const server = await client.mcpServers.getById({
  userId: 'user_123',
  serverId: 'exa_ai',
});
```

#### Parameters

<ParamField path="userId" type="string" required>
  User or tenant identifier.
</ParamField>

<ParamField path="serverId" type="string" required>
  The unique server identifier.
</ParamField>

**Returns:** `Promise<McpServer | null>`

---

### `update(params)`

Applies a partial update to an existing MCP server configuration.

```typescript
const updated = await client.mcpServers.update({
  userId: 'user_123',
  serverId: 'exa_ai',
  name: 'Exa AI Pro',
  enabled: true,
});
```

#### Parameters

<ParamField path="userId" type="string" required>
  User or tenant identifier.
</ParamField>

<ParamField path="serverId" type="string" required>
  The unique server identifier.
</ParamField>

<ParamField path="name" type="string">
  Updated display name.
</ParamField>

<ParamField path="url" type="string">
  Updated server endpoint URL.
</ParamField>

<ParamField path="description" type="string">
  Updated description.
</ParamField>

<ParamField path="enabled" type="boolean">
  Updated enabled state.
</ParamField>

<ParamField path="auth" type="McpServerAuthRequest">
  Updated authentication configuration.
</ParamField>

<ParamField path="toolPolicy" type="ToolPolicy">
  Updated tool policy (`mode: 'all' | 'allowlist' | 'denylist'`, `toolIds: string[]`).
</ParamField>

<ParamField path="metadata" type="Record<string, unknown>">
  Updated custom metadata object.
</ParamField>


**Returns:** `Promise<McpServer>`

---

### `delete(params)`

Deletes an MCP server configuration and cleans up associated sessions and stored tokens.

```typescript
const result = await client.mcpServers.delete({
  userId: 'user_123',
  serverId: 'exa_ai',
});
```

#### Parameters

<ResponseField name="userId" type="string" required>
  User or tenant identifier.
</ResponseField>

<ResponseField name="serverId" type="string" required>
  The unique server identifier.
</ResponseField>

#### Returns: `Promise<McpServersDeleteResponse>`

```typescript
{
  object: 'mcp_server',
  id: 'exa_ai',
  deleted: true
}
```

---

### `createOAuthAuthorizationUrl(params)`

Generates a fresh OAuth 2.1 browser authorization URL with PKCE for an MCP server requiring authentication.

```typescript
const auth = await client.mcpServers.createOAuthAuthorizationUrl({
  userId: 'user_123',
  serverId: 'v8kn7q12x9pq',
  callbackUrl: 'https://myapp.com/oauth/callback',
  clientMetadataUrl: 'https://myapp.com/oauth/client-metadata.json',
});

console.log(auth);
// {
//   object: 'mcp_server_oauth_authorization',
//   serverId: 'v8kn7q12x9pq',
//   url: 'https://auth.exa.ai/oauth/authorize?...',
//   state: 'NUVkkiwpo7WYN50AS4gLGzIaIWPpWLEj.sess_...',
//   expiresAt: '2026-09-28T08:26:38.855Z'
// }
```

#### Parameters

<ResponseField name="userId" type="string" required>
  User or tenant identifier.
</ResponseField>

<ResponseField name="serverId" type="string" required>
  The unique server identifier.
</ResponseField>

<ResponseField name="callbackUrl" type="string">
  Optional OAuth callback redirect URI.
</ResponseField>

<ResponseField name="clientMetadataUrl" type="string">
  Optional Client ID Metadata Document (CIMD) URL override for OAuth authorization.
</ResponseField>

**Returns:** `Promise<McpServerOAuthAuthorization>`

| Property | Type | Description |
| :--- | :--- | :--- |
| `object` | `'mcp_server_oauth_authorization'` | Fixed object discriminator. |
| `serverId` | `string` | The ID of the MCP server being authorized. |
| `url` | `string` | The provider authorization URL to redirect the user to. |
| `state` | `string` | The OAuth state token. Expires after 10 minutes. |
| `expiresAt` | `string` | ISO 8601 timestamp when the authorization URL expires. |

---

### `finishAuth(params)`

Completes the OAuth 2.1 PKCE authorization code exchange.

```typescript
const server = await client.mcpServers.finishAuth({
  userId: 'user_123',
  code: 'auth_code_from_redirect',
  state: 'state_from_redirect',
  iss: 'optional_issuer_url',
});
```

#### Parameters

<ParamField path="userId" type="string" required>
  User or tenant identifier.
</ParamField>

<ParamField path="code" type="string" required>
  OAuth authorization code returned by the authorization server.
</ParamField>

<ParamField path="state" type="string" required>
  OAuth state value returned by the authorization server.
</ParamField>

<ParamField path="iss" type="string">
  Optional OAuth issuer URL returned by the authorization server.
</ParamField>

**Returns:** `Promise<McpServer>`

---

### `listTools(params)`

Lists all available tools from a registered MCP server. Automatically establishes and manages connection pooling for active servers.

```typescript
const { tools } = await client.mcpServers.listTools({
  userId: 'user_123',
  serverId: 'exa_ai',
});
```

#### Parameters

<ResponseField name="userId" type="string" required>
  User or tenant identifier.
</ResponseField>

<ResponseField name="serverId" type="string" required>
  The unique server identifier.
</ResponseField>

**Returns:** `Promise<{ tools: Tool[] }>`

---

### `callTool(params)`

Executes a tool on an MCP server with arguments.

```typescript
const result = await client.mcpServers.callTool({
  userId: 'user_123',
  serverId: 'exa_ai',
  toolName: 'web_search',
  args: { query: 'Model Context Protocol' },
});
```

#### Parameters

<ResponseField name="userId" type="string" required>
  User or tenant identifier.
</ResponseField>

<ResponseField name="serverId" type="string" required>
  The unique server identifier.
</ResponseField>

<ResponseField name="toolName" type="string" required>
  Name of the tool to execute.
</ResponseField>

<ResponseField name="args" type="Record<string, unknown>">
  Arguments object passed to the tool schema.
</ResponseField>

**Returns:** `Promise<CallToolResult>`

---

### `listPrompts(params)`

Lists available prompts from an MCP server.

```typescript
const { prompts } = await client.mcpServers.listPrompts({
  userId: 'user_123',
  serverId: 'coding_assistant',
});
```

#### Parameters

<ResponseField name="userId" type="string" required>
  User or tenant identifier.
</ResponseField>

<ResponseField name="serverId" type="string" required>
  The unique server identifier.
</ResponseField>

**Returns:** `Promise<{ prompts: Prompt[] }>`

---

### `getPrompt(params)`

Retrieves a specific prompt with parameter substitutions from an MCP server.

```typescript
const result = await client.mcpServers.getPrompt({
  userId: 'user_123',
  serverId: 'coding_assistant',
  name: 'code_review',
  args: { diff: '...' },
});
```

#### Parameters

<ResponseField name="userId" type="string" required>
  User or tenant identifier.
</ResponseField>

<ResponseField name="serverId" type="string" required>
  The unique server identifier.
</ResponseField>

<ResponseField name="name" type="string" required>
  Name of the prompt to retrieve.
</ResponseField>

<ResponseField name="args" type="Record<string, string>">
  Optional string arguments for the prompt template.
</ResponseField>

**Returns:** `Promise<GetPromptResult>`

---

### `listResources(params)`

Lists available resources from an MCP server.

```typescript
const { resources } = await client.mcpServers.listResources({
  userId: 'user_123',
  serverId: 'filesystem',
});
```

#### Parameters

<ResponseField name="userId" type="string" required>
  User or tenant identifier.
</ResponseField>

<ResponseField name="serverId" type="string" required>
  The unique server identifier.
</ResponseField>

**Returns:** `Promise<{ resources: Resource[] }>`

---

### `readResource(params)`

Reads the content of a specific resource URI from an MCP server.

```typescript
const result = await client.mcpServers.readResource({
  userId: 'user_123',
  serverId: 'filesystem',
  uri: 'file:///workspace/README.md',
});
```

#### Parameters

<ResponseField name="userId" type="string" required>
  User or tenant identifier.
</ResponseField>

<ResponseField name="serverId" type="string" required>
  The unique server identifier.
</ResponseField>

<ResponseField name="uri" type="string" required>
  The URI of the resource to read.
</ResponseField>

**Returns:** `Promise<ReadResourceResult>`

---

### `listResourceTemplates(params)`

Lists available resource URI templates from an MCP server.

```typescript
const { resourceTemplates } = await client.mcpServers.listResourceTemplates({
  userId: 'user_123',
  serverId: 'filesystem',
});
```

#### Parameters

<ResponseField name="userId" type="string" required>
  User or tenant identifier.
</ResponseField>

<ResponseField name="serverId" type="string" required>
  The unique server identifier.
</ResponseField>

**Returns:** `Promise<{ resourceTemplates: ResourceTemplate[] }>`

---

## Data Models

### `McpServer`

```typescript
interface McpServer {
  id: string;
  object: 'mcp_server';
  name: string;
  url: string;
  description?: string;
  enabled: boolean;
  status: McpServerConnectionStatus;
  auth: McpServerAuth;
  toolPolicy?: ToolPolicy;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt?: string;
}
```

### `ToolPolicy`

Controls which tools from this MCP server are permitted or blocked when connecting:

```typescript
interface ToolPolicy {
  mode: 'all' | 'allowlist' | 'denylist';
  toolIds: string[];
  updatedAt?: number;
}
```


### `McpServerConnectionStatus`

Discriminated union indicating live server connectivity:

```typescript
type McpServerConnectionStatus =
  | { state: 'connected' }
  | { state: 'disconnected' }
  | { state: 'auth_required'; authorizationUrl?: string }
  | { state: 'error'; message: string };
```

### `McpServerAuth`

Authentication configuration with credentials and endpoints grouped under `config`:

```typescript
type McpServerAuth =
  | {
      type: 'none';
    }
  | {
      type: 'bearer';
      token?: string; // Accepted on input; omitted in read responses
    }
  | {
      type: 'custom-headers';
      headers?: Record<string, string>; // Values redacted to "" in read responses
    }
  | {
      type: 'oauth';
      config?: {
        clientId?: string; // Accepted on input; omitted in read responses
        clientMetadataUrl?: string;
        scopes?: string[];
        authorizationUrl?: string;
        tokenUrl?: string;
        registrationUrl?: string;
        resourceUrl?: string;
        clientIdMetadataDocumentSupported?: boolean;
      };
    };
```
