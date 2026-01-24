---
sidebar_position: 4
---

# React Hook (useMcp)

The `useMcp` hook provides a simple way to manage MCP connections in React applications.

## Basic Usage

```typescript
import { useMcp } from '@mcp-ts/redis/client';

function MyComponent() {
  const { connections, connect, disconnect, status } = useMcp({
    url: '/api/mcp',
    identity: 'user-123',
  });

  return (
    <div>
      <p>Status: {status}</p>
      {connections.map(conn => (
        <div key={conn.sessionId}>
          <h3>{conn.serverName}</h3>
          <p>{conn.state}</p>
        </div>
      ))}
    </div>
  );
}
```

## Configuration Options

```typescript
useMcp({
  // Required: SSE endpoint URL
  url: '/api/mcp',

  // Required: User identifier
  identity: 'user-123',

  // Optional: Authentication token
  authToken: 'your-auth-token',

  // Optional: Auto-connect SSE on mount (default: true)
  autoConnect: true,

  // Optional: Auto-load sessions on mount (default: true)
  autoInitialize: true,

  // Optional: Connection event handler
  onConnectionEvent: (event) => {
    console.log('Event:', event);
  },

  // Optional: Debug log handler
  onLog: (level, message, metadata) => {
    console.log(`[${level}] ${message}`, metadata);
  },
})
```

## Return Values

### State

```typescript
const {
  // Connection list
  connections,        // Connection[] - All active connections
  status,            // SSEStatus - SSE connection status
  isInitializing,    // boolean - Loading initial sessions

  // ... methods below
} = useMcp({...});
```

### Connection Methods

```typescript
// Connect to an MCP server
const sessionId = await connect({
  serverId: 'server-id',
  serverName: 'My Server',
  serverUrl: 'https://mcp.example.com',
  callbackUrl: window.location.origin + '/callback',
  // transportType: 'auto', // optional: defaults to auto-negotiate (Streamable -> SSE)
});

// Disconnect from a server
await disconnect(sessionId);

// Reload all sessions
await refresh();

// Manually control SSE connection
connectSSE();
disconnectSSE();

// Complete OAuth flow
await finishAuth(code, state);
```

### Tool Operations

```typescript
// Call a tool
const result = await callTool(sessionId, 'tool_name', {
  arg1: 'value',
});

// List available tools
const tools = await listTools(sessionId);
```

### Prompt Operations

```typescript
// List available prompts
const { prompts } = await listPrompts(sessionId);

// Get a specific prompt
const prompt = await getPrompt(sessionId, 'prompt_name', {
  arg1: 'value',
});
```

### Resource Operations

```typescript
// List available resources
const { resources } = await listResources(sessionId);

// Read a specific resource
const resource = await readResource(sessionId, 'file:///path');
```

### Utility Methods

```typescript
// Get connection by session ID
const conn = getConnection(sessionId);

// Get connection by server ID
const conn = getConnectionByServerId(serverId);

// Check if server is connected
const isConnected = isServerConnected(serverId);

// Get tools for a session
const tools = getTools(sessionId);
```

## Connection Object

Each connection has the following structure:

```typescript
interface Connection {
  sessionId: string;
  serverId: string;
  serverName: string;
  serverUrl: string;
  state: McpConnectionState;
  tools: ToolInfo[];
  error?: string;
  timestamp: number;
}
```

## Connection States

Connections progress through these states:

```typescript
type McpConnectionState =
  | 'DISCONNECTED'      // Not connected
  | 'CONNECTING'        // Attempting to connect
  | 'AUTHENTICATING'    // OAuth in progress
  | 'AUTHENTICATED'     // OAuth complete
  | 'DISCOVERING'       // Loading tools
  | 'CONNECTED'         // Fully connected
  | 'VALIDATING'        // Validating session
  | 'RECONNECTING'      // Reconnecting
  | 'FAILED';           // Connection failed
```

## Event Handling

Handle connection events for custom logic:

```typescript
const { connections } = useMcp({
  url: '/api/mcp',
  identity: 'user-123',
  onConnectionEvent: (event) => {
    switch (event.type) {
      case 'state_changed':
        console.log('State:', event.state);
        break;

      case 'tools_discovered':
        console.log('Tools:', event.tools);
        break;

      case 'auth_required':
        // Redirect to OAuth
        window.location.href = event.authUrl;
        break;

      case 'error':
        console.error('Error:', event.error);
        break;

      case 'disconnected':
        console.log('Disconnected:', event.reason);
        break;
    }
  },
});
```

## Examples

### Connect and Call Tool

```typescript
function ToolCaller() {
  const { connections, connect, callTool } = useMcp({
    url: '/api/mcp',
    identity: 'user-123',
  });

  const handleConnect = async () => {
    const sessionId = await connect({
      serverId: 'weather-server',
      serverName: 'Weather Server',
      serverUrl: 'https://weather-mcp.example.com',
      callbackUrl: window.location.origin + '/callback',
    });

    // Call a tool after connecting
    const result = await callTool(sessionId, 'get_weather', {
      location: 'San Francisco',
    });

    console.log('Weather:', result);
  };

  return <button onClick={handleConnect}>Get Weather</button>;
}
```

### Display Connection Status

```typescript
function ConnectionStatus() {
  const { connections, status } = useMcp({
    url: '/api/mcp',
    identity: 'user-123',
  });

  return (
    <div>
      <p>SSE Status: {status}</p>

      {connections.map(conn => (
        <div key={conn.sessionId}>
          <h3>{conn.serverName}</h3>
          <div>
            State: <span style={{
              color: conn.state === 'CONNECTED' ? 'green' : 'orange'
            }}>
              {conn.state}
            </span>
          </div>

          {conn.state === 'CONNECTED' && (
            <p>Tools: {conn.tools.length}</p>
          )}

          {conn.error && (
            <p style={{ color: 'red' }}>Error: {conn.error}</p>
          )}
        </div>
      ))}
    </div>
  );
}
```

### Handle OAuth Redirect

```typescript
function McpWithAuth() {
  const { connect } = useMcp({
    url: '/api/mcp',
    identity: 'user-123',
    onConnectionEvent: (event) => {
      if (event.type === 'auth_required') {
        // Redirect to OAuth page
        window.location.href = event.authUrl;
      }
    },
  });

  return (
    <button onClick={() => connect({
      serverId: 'protected-server',
      serverName: 'Protected Server',
      serverUrl: 'https://secure-mcp.example.com',
      callbackUrl: window.location.origin + '/oauth/callback',
    })}>
      Connect (will redirect for auth)
    </button>
  );
}
```

## TypeScript Types

Import types for better type safety:

```typescript
import type {
  McpConnectionState,
  McpConnectionEvent,
  ToolInfo,
} from '@mcp-ts/redis/shared';

import type {
  McpClient, // Return type of useMcp
} from '@mcp-ts/redis/client';
```

## Next Steps

- [API Reference](./api-reference.md) - Complete API documentation
- [Examples](https://github.com/ashen-dusk/mcp-ts/tree/main/examples) - More practical examples
