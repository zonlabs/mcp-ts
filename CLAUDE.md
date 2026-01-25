# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) and other AI assistants when working with the mcp-redis package.

## Package Overview

`@mcp-ts/redis` is an npm package that provides Redis-backed MCP (Model Context Protocol) client functionality with OAuth 2.1 authentication and real-time SSE (Server-Sent Events) connections. It's designed for serverless environments and follows the Cloudflare agents pattern for observable state management.

## Recent Changes (v1.0.0-beta.3+)

### Breaking Changes
- **Package Renamed**: `@mcp-assistant/mcp-redis` -> `@mcp-ts/redis`
- **Updated Imports**: All imports should now use `@mcp-ts/redis`

### API Improvements
- **Renamed `validateAuth` → `authenticate`**: More conventional naming following industry standards
- **Renamed `refreshSession` → `restoreSession`**: Better describes the action of restoring session from storage
- **Renamed `UseMcpReturn` → `McpClient`**: More conventional interface naming pattern

### New Features
- **Prompts Support**: Added `listPrompts()` and `getPrompt()` methods for working with MCP prompts
- **Resources Support**: Added `listResources()` and `readResource()` methods for accessing MCP resources
- **Improved Request IDs**: Request IDs now use `nanoid` with `rpc_` prefix (e.g., `rpc_V1StGXR8`) for better traceability

### Developer Experience
- **Better Memory Management**: Renamed `oldManager` → `previousManager` for clarity in connection cleanup
- **Full MCP Protocol**: Complete implementation of tools, prompts, and resources from MCP SDK

## Architecture

The package is structured into three main parts:

### 1. Server (`src/server/`)
Node.js server-side code for MCP connections and session management:
- **`oauth-client.ts`** - Main MCPClient class with OAuth 2.1 support
- **`session-store.ts`** - Redis-backed session management with 12-hour TTL
- **`redis-oauth-client-provider.ts`** - OAuth provider implementation using Redis
- **`sse-handler.ts`** - SSE endpoint handler for real-time connection updates
- **`session-provider.ts`** - Abstraction for session operations (server vs client)

### 2. Client (`src/client/`)
Browser/React client-side code:
- **`sse-client.ts`** - Browser-based SSE client for real-time communication
- **`useMcp.ts`** - React hook for managing MCP connections

### 3. Shared (`src/shared/`)
Common types and utilities:
- **`events.ts`** - Event emitter system and connection state types
- **`types.ts`** - TypeScript types for API requests/responses and RPC
- **`utils.ts`** - Shared utility functions

## Key Design Patterns

### SSE-Based Real-Time Updates (Not WebSockets)

Unlike WebSocket-based systems, this package uses **Server-Sent Events (SSE)** for real-time updates:
- **Server → Client**: Events stream via SSE
- **Client → Server**: RPC calls via HTTP POST to the same endpoint

This design is inspired by Cloudflare's agents pattern but adapted for HTTP/SSE instead of WebSockets, making it serverless-friendly.

### Observable State Pattern

The system uses an event-driven architecture:
```typescript
// Connection events flow through the system
client.onConnectionEvent((event) => {
  switch (event.type) {
    case 'state_changed': // Connection state transitions
    case 'tools_discovered': // Tools loaded from MCP server
    case 'auth_required': // OAuth authorization needed
    case 'error': // Connection errors
    case 'disconnected': // Connection closed
  }
});
```

### Stateless Session Management

All MCP connection state is stored in Redis, allowing serverless functions to:
1. Create a session with minimal info (identity + sessionId)
2. Reconstruct full client state from Redis
3. Handle requests without in-memory state
4. Auto-refresh OAuth tokens transparently

### Dual Export Strategy

The package supports both server and client usage:
```typescript
// Server-side (Node.js)
import { MCPClient, sessionStore, createSSEHandler } from '@mcp-ts/redis/server';

// Client-side (React/Browser)
import { useMcp, SSEClient } from '@mcp-ts/redis/client';

// Shared utilities
import { McpConnectionState, ToolInfo } from '@mcp-ts/redis/shared';
```

## Common Development Tasks

### Adding New SSE Events

When adding new event types:

1. **Define event in `src/shared/events.ts`**:
```typescript
export type McpConnectionEvent =
  | { type: 'state_changed'; sessionId: string; state: McpConnectionState; ... }
  | { type: 'your_new_event'; sessionId: string; yourData: string; ... }; // Add here
```

2. **Emit event in `src/server/sse-handler.ts`**:
```typescript
this.emitConnectionEvent({
  type: 'your_new_event',
  sessionId,
  yourData: 'value',
  timestamp: Date.now(),
});
```

3. **Handle event in `src/client/useMcp.ts`**:
```typescript
const updateConnectionsFromEvent = useCallback((event: McpConnectionEvent) => {
  switch (event.type) {
    case 'your_new_event':
      // Update local state
      break;
  }
}, []);
```

### Adding New RPC Methods

To add a new RPC method that clients can call:

1. **Add method to type in `src/shared/types.ts`**:
```typescript
export interface McpRpcRequest {
  id: string;
  method: 'connect' | 'disconnect' | 'your_method'; // Add here
  params?: any;
}
```

2. **Implement handler in `src/server/sse-handler.ts`**:
```typescript
async handleRequest(request: McpRpcRequest): Promise<void> {
  switch (request.method) {
    case 'your_method':
      result = await this.yourMethod(request.params);
      break;
  }
}

private async yourMethod(params: any): Promise<any> {
  // Implementation
}
```

3. **Add client method in `src/client/sse-client.ts`**:
```typescript
async yourMethod(param1: string): Promise<any> {
  return this.sendRequest('your_method', { param1 });
}
```

4. **Expose in React hook `src/client/useMcp.ts`**:
```typescript
const yourMethod = useCallback(async (param1: string) => {
  if (!clientRef.current) throw new Error('Client not initialized');
  return await clientRef.current.yourMethod(param1);
}, []);

return {
  // ... existing returns
  yourMethod,
};
```

### Modifying Connection States

Connection states are defined in `src/shared/events.ts`:
```typescript
export type McpConnectionState =
  | 'DISCONNECTED'
  | 'CONNECTING'
  | 'AUTHENTICATING'
  | 'AUTHENTICATED'
  | 'DISCOVERING'
  | 'CONNECTED'
  | 'VALIDATING'
  | 'RECONNECTING'
  | 'FAILED';
```

When adding new states:
1. Add to the union type above
2. Handle state transitions in `oauth-client.ts`
3. Update UI rendering logic in consumer apps

### Testing Changes

```bash
# Type check
npm run type-check

# Build package
npm run build

# Watch mode during development
npm run dev

# Test in a local project
npm link
cd ../your-project
npm link @mcp-ts/redis
```

## Integration Examples

### Server-Side: Create SSE Endpoint

```typescript
import { createSSEHandler } from '@mcp-ts/redis/server';
import { createServer } from 'http';

const handler = createSSEHandler({
  identity: 'user-123', // Get from auth
  heartbeatInterval: 30000,
});

createServer(handler).listen(3000);
```

### Client-Side: React Hook Usage

```typescript
import { useMcp } from '@mcp-ts/redis/client';

function MyComponent() {
  const { connections, connect, disconnect, status } = useMcp({
    url: '/api/mcp/sse',
    identity: 'user-123',
    authToken: 'your-auth-token',
  });

  return (
    <div>
      <p>Status: {status}</p>
      {connections.map(conn => (
        <div key={conn.sessionId}>
          {conn.serverName}: {conn.state}
        </div>
      ))}
    </div>
  );
}
```

## Build and Publishing

### Build Configuration (`tsup.config.ts`)

The package uses tsup to build multiple entry points:
- Main exports: `dist/index.{js,mjs,d.ts}`
- Server: `dist/server/index.{js,mjs,d.ts}`
- Client: `dist/client/index.{js,mjs,d.ts}`
- Shared: `dist/shared/index.{js,mjs,d.ts}`

### Publishing to npm

```bash
# Ensure you're logged in
npm login

# Update version in package.json
npm version patch|minor|major

# Build and publish (prepublishOnly script runs automatically)
npm publish
```

## Dependencies

### Runtime Dependencies
- **`@modelcontextprotocol/sdk`** - Official MCP SDK
- **`ioredis`** - Redis client for Node.js
- **`nanoid`** - ID generation

### Peer Dependencies (Optional)
- **`react`** - Only needed if using `useMcp` hook

### Dev Dependencies
- **`typescript`** - Type checking
- **`tsup`** - Build tool
- **`@types/node`** - Node.js types
- **`@types/react`** - React types

## Redis Schema

Sessions are stored with the following structure:

**Key Pattern**: `mcp:session:{sessionId}`
**TTL**: 43200 seconds (12 hours)
**Value**:
```json
{
  "sessionId": "abc123",
  "identity": "user-123",
  "serverId": "server-xyz",
  "serverName": "Example Server",
  "serverUrl": "https://mcp.example.com",
  "callbackUrl": "http://localhost:3000/callback",
  "transportType": "sse",
  "active": true,
  "tokens": {
    "access_token": "...",
    "refresh_token": "...",
    "expires_in": 3600
  },
  "clientInformation": { ... }
}
```

**User Sessions Index**: `mcp:user:{identity}:sessions` (set of sessionIds)

## Error Handling

Common error scenarios:

1. **Session Not Found**: Session expired or doesn't exist in Redis
2. **OAuth Required**: `UnauthorizedError` thrown when OAuth authorization needed
3. **Token Expired**: Automatically refreshed if refresh token available
4. **Connection Failed**: Network errors, server unreachable
5. **SSE Disconnected**: Auto-reconnect with exponential backoff

## Type Safety

The package is fully typed with TypeScript. Key type exports:

```typescript
// Connection events
import type { McpConnectionEvent, McpConnectionState } from '@mcp-ts/redis/shared';

// RPC types
import type { McpRpcRequest, McpRpcResponse } from '@mcp-ts/redis/shared';

// Tool info
import type { ToolInfo } from '@mcp-ts/redis/shared';

// OAuth types (re-exported from MCP SDK)
import type { OAuthTokens, OAuthClientInformation } from '@mcp-ts/redis/server';
```

## Best Practices

1. **Always handle OAuth redirects**: Check for `auth_required` events
2. **Use session validation**: Call `restoreSession` on app load to validate stored sessions
3. **Handle SSE reconnection**: The client auto-reconnects, but show UI feedback
4. **Clean up on unmount**: React hooks handle this automatically
5. **Don't commit Redis keys**: Sessions expire automatically via TTL
6. **Use proper error boundaries**: Wrap SSE connections in error boundaries

## Troubleshooting

### Build Issues

**Problem**: TypeScript errors during build
- Run `npm run type-check` to see detailed errors
- Ensure all imports use `.js` extensions for ESM compatibility

**Problem**: Circular dependencies
- Check import paths in index files
- Use `type` imports where possible: `import type { ... }`

### Runtime Issues

**Problem**: Redis connection errors
- Ensure Redis is running: `redis-cli ping`
- Check `REDIS_URL` environment variable
- Verify network connectivity

**Problem**: SSE not connecting
- Check browser console for CORS errors
- Verify endpoint URL is correct
- Ensure auth token is passed if required

**Problem**: OAuth flow broken
- Check callback URL matches server configuration
- Verify state parameter is preserved
- Ensure session exists in Redis during callback

## Contributing

When making changes:
1. Update type definitions first
2. Implement server-side logic
3. Update client-side code
4. Test both server and client
5. Update documentation (README.md, CLAUDE.md)
6. Run build to ensure no errors

## Attribution

This package was developed with assistance from Claude (Anthropic's AI assistant). The architecture was inspired by:
- Cloudflare's agents pattern (observable state management)
- MCP SDK best practices (OAuth 2.1 flows)
- Modern npm package standards (dual ESM/CJS exports)
