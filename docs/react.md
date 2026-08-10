---
title: "React"
sidebarTitle: "React"
description: "Manage MCP connections in React applications with the useMcp hook: connect to servers, list and call tools, handle OAuth, and stream tool results."
icon: "react"
---

The `useMcp` hook provides a simple way to manage MCP connections in React applications.

## Basic Usage

```typescript
import { useMcp } from '@mcp-ts/sdk/client/react';

function MyComponent() {
  const { connections, connect, disconnect, status } = useMcp({
    url: '/api/mcp',
    userId: 'user-123',
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
  // Required: MCP endpoint URL
  url: '/api/mcp',

  // Required: User identifier
  userId: 'user-123',

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
});

// Disconnect from a server
await disconnect(sessionId);

// Reload all sessions
await refresh();

// Manually control SSE connection
connectSSE();
disconnectSSE();

// Complete OAuth flow
await finishAuth(state, code);
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
  userId: 'user-123',
  onConnectionEvent: (event) => {
    switch (event.type) {
      case 'state_changed':
        console.log('State:', event.state);
        break;

      case 'capabilities_discovered':
        console.log('Tools, prompts, resources:', event.tools, event.prompts, event.resources);
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
    userId: 'user-123',
  });

  const handleConnect = async () => {
    const sessionId = await connect({
      serverId: 'weather-server',
      serverName: 'Weather Server',
      serverUrl: 'https://weather-mcp.example.com',
      callbackUrl: window.location.origin + '/api/mcp/callback',
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
    userId: 'user-123',
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
            <p >Error: {conn.error}</p>
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
    userId: 'user-123',
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
      callbackUrl: window.location.origin + '/oauth/callback-popup',
    })}>
      Connect (will redirect for auth)
    </button>
  );
}
```

## OAuth UI Patterns

OAuth handling in the React client is built around two core primitives:

- `useMcp({ onRedirect })` decides how auth navigation happens
- `finishAuth(state, code)` completes the authorization code exchange

The popup helpers are optional convenience utilities on top of that. You can:

- use the shared popup helpers as-is
- bring your own popup UI
- skip popups entirely and use a normal callback page

### Turnkey popup flow

```tsx
'use client';

import { Suspense, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  createOAuthPopupRedirectHandler,
  McpOAuthCallbackContent,
  McpOAuthCallbackFallback,
  useMcp,
  useMcpOAuthPopup,
} from '@mcp-ts/sdk/client/react';

function App() {
  const handleOAuthRedirect = useMemo(
    () => createOAuthPopupRedirectHandler(),
    [],
  );

  const mcpClient = useMcp({
    url: '/api/mcp',
    userId: 'user-123',
    onRedirect: handleOAuthRedirect,
  });

  useMcpOAuthPopup(mcpClient.connections, mcpClient.finishAuth);

  return <div>Your app</div>;
}

export function OAuthPopupCallbackPage() {
  const searchParams = useSearchParams();

  return (
    <Suspense fallback={<McpOAuthCallbackFallback />}>
      <McpOAuthCallbackContent
        code={searchParams.get('code')}
        sessionId={searchParams.get('state')}
      />
    </Suspense>
  );
}
```

### Custom popup UI with shared callback logic

```tsx
<McpOAuthCallbackContent
  code={searchParams.get('code')}
  sessionId={searchParams.get('state')}
  title={<span>Connecting your MCP workspace</span>}
  rootStyle={{ backgroundColor: '#0b1020', color: '#f8fafc' }}
  cardStyle={{
    backgroundColor: 'rgba(15, 23, 42, 0.92)',
    border: '1px solid rgba(148, 163, 184, 0.18)',
    borderRadius: '20px',
    boxShadow: '0 20px 60px rgba(15, 23, 42, 0.35)',
  }}
  messageStyle={{ color: '#cbd5e1' }}
/>
```

Use this when you want branded popup visuals without rebuilding the
`postMessage` / `finishAuth` coordination yourself.

### Full-page redirect flow

```tsx
'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useMcp } from '@mcp-ts/sdk/client/react';

export default function OAuthCallbackPage() {
  const searchParams = useSearchParams();
  const { finishAuth } = useMcp({
    url: '/api/mcp',
    userId: 'user-123',
  });

  useEffect(() => {
    const code = searchParams.get('code');
    const sessionId = searchParams.get('state');
    if (!code || !sessionId) return;

    void finishAuth(sessionId, code);
  }, [searchParams, finishAuth]);

  return <p>Completing sign-in...</p>;
}
```

Use this when you do not want popups at all and prefer a normal callback route.

## TypeScript Types

Import types for better type safety:

```typescript
import type {
  McpConnectionState,
  McpConnectionEvent,
  ToolInfo,
} from '@mcp-ts/sdk/shared';
```

## Next Steps

- [MCP Apps](/mcp-apps) — Interactive tool UIs (`McpAppRenderer`, sandbox proxy, AppBridge)
- [API Reference](/reference/server) - Complete API documentation
- [Examples](https://github.com/zonlabs/mcp-ts/tree/main/examples) - More practical examples
