# @mcp-assistant/mcp-redis

Redis-backed MCP (Model Context Protocol) client with OAuth 2.0 and real-time SSE connections for serverless environments.

[![npm version](https://badge.fury.io/js/@mcp-assistant%2Fmcp-redis.svg)](https://www.npmjs.com/package/@mcp-assistant/mcp-redis)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- **🔄 Real-Time SSE**: Server-Sent Events for live connection updates (no WebSockets needed)
- **🔐 OAuth 2.0**: Full OAuth support with automatic token refresh
- **📦 Redis-Backed**: Stateless session management with 12-hour TTL
- **⚡ Serverless-Ready**: Works in serverless environments (Vercel, AWS Lambda, etc.)
- **⚛️ React Hook**: `useMcp` hook for easy React integration
- **🛠️ MCP Protocol Support**: Full support for tools, prompts, and resources
- **🎯 Observable State**: Cloudflare agents-inspired event system
- **📘 TypeScript**: Full type safety with exported types
- **🚀 Dual Exports**: Separate server and client packages

## Installation

```bash
npm install @mcp-assistant/mcp-redis
# or
yarn add @mcp-assistant/mcp-redis
# or
pnpm add @mcp-assistant/mcp-redis
```

## Quick Start

### Server-Side: Create SSE Endpoint

```typescript
import { createSSEHandler } from '@mcp-assistant/mcp-redis/server';
import { createServer } from 'http';

// Create SSE handler for real-time MCP connections
const handler = createSSEHandler({
  userId: 'user-123', // Get from authentication
  heartbeatInterval: 30000, // Optional: 30s heartbeat
});

// Start server
createServer(handler).listen(3000);
console.log('SSE endpoint running on http://localhost:3000');
```

### Client-Side: React Hook

```typescript
import { useMcp } from '@mcp-assistant/mcp-redis/client';

function MyComponent() {
  const {
    connections,
    status,
    connect,
    disconnect,
    callTool,
    isInitializing,
  } = useMcp({
    url: '/api/mcp/sse',
    userId: 'user-123',
    authToken: 'your-auth-token', // Optional
    autoConnect: true,
    autoInitialize: true,
  });

  const handleConnect = async () => {
    const sessionId = await connect({
      serverId: 'my-server-id',
      serverName: 'My MCP Server',
      serverUrl: 'https://mcp.example.com',
      callbackUrl: window.location.origin + '/oauth/callback',
      transportType: 'sse',
    });
    console.log('Connected with session:', sessionId);
  };

  const handleCallTool = async (sessionId: string, toolName: string) => {
    try {
      const result = await callTool(sessionId, toolName, {
        // Tool arguments
      });
      console.log('Tool result:', result);
    } catch (error) {
      console.error('Tool call failed:', error);
    }
  };

  return (
    <div>
      <h2>MCP Connections</h2>
      <p>SSE Status: {status}</p>
      <button onClick={handleConnect}>Connect to Server</button>

      {isInitializing && <p>Loading sessions...</p>}

      {connections.map((conn) => (
        <div key={conn.sessionId}>
          <h3>{conn.serverName}</h3>
          <p>State: {conn.state}</p>
          <p>Tools: {conn.tools.length}</p>
          {conn.state === 'CONNECTED' && (
            <>
              {conn.tools.map((tool) => (
                <button
                  key={tool.name}
                  onClick={() => handleCallTool(conn.sessionId, tool.name)}
                >
                  {tool.name}
                </button>
              ))}
              <button onClick={() => disconnect(conn.sessionId)}>
                Disconnect
              </button>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
```

## Architecture

### SSE-Based Real-Time Communication

Unlike WebSocket-based systems, this package uses **Server-Sent Events (SSE)**:

```
┌─────────┐                    ┌──────────┐
│ Browser │◄───SSE Events──────│  Server  │
│         │                    │          │
│         ├────HTTP POST───────►│  (Node)  │
└─────────┘   (RPC calls)      └──────────┘
```

**Benefits:**
- Works behind most corporate firewalls
- Serverless-friendly (no persistent connections in memory)
- Built-in reconnection in browsers
- Simpler than WebSockets

### Package Structure

```
@mcp-assistant/mcp-redis
├── /server       # Node.js server-side
│   ├── MCPClient
│   ├── SessionStore
│   ├── createSSEHandler
│   └── OAuth providers
├── /client       # Browser/React client
│   ├── SSEClient
│   └── useMcp (React hook)
└── /shared       # Common types/utils
    ├── Events
    ├── Types
    └── Utils
```

## Usage

### Server-Side API

#### Creating an SSE Endpoint

**Next.js API Route** (`pages/api/mcp/sse.ts`):
```typescript
import { createSSEHandler } from '@mcp-assistant/mcp-redis/server';
import { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const userId = req.query.userId as string; // Get from auth

  const sseHandler = createSSEHandler({
    userId,
    onAuth: async (uid) => {
      // Optional: Verify user authorization
      return uid === userId;
    },
  });

  return sseHandler(req, res);
}
```

**Express Server**:
```typescript
import express from 'express';
import { createSSEHandler } from '@mcp-assistant/mcp-redis/server';

const app = express();

app.get('/mcp/sse', (req, res) => {
  const userId = req.user.id; // Get from auth middleware

  const handler = createSSEHandler({ userId });
  handler(req, res);
});

app.listen(3000);
```

#### Using MCPClient Directly

```typescript
import { MCPClient, sessionStore } from '@mcp-assistant/mcp-redis/server';

// Generate session ID
const sessionId = sessionStore.generateSessionId();

// Create client
const client = new MCPClient({
  userId: 'user-123',
  sessionId,
  serverUrl: 'https://mcp.example.com',
  callbackUrl: 'http://localhost:3000/oauth/callback',
  transportType: 'sse',
  onRedirect: (authUrl) => {
    console.log('Redirect user to:', authUrl);
  },
});

// Connect (may throw UnauthorizedError if OAuth needed)
try {
  await client.connect();
  console.log('Connected successfully');

  // List tools
  const tools = await client.listTools();
  console.log('Available tools:', tools.tools);

  // Call a tool
  const result = await client.callTool('tool_name', {
    arg1: 'value',
  });
  console.log('Tool result:', result);
} catch (error) {
  if (error instanceof UnauthorizedError) {
    // Handle OAuth redirect
  }
}
```

#### OAuth Callback Handler

```typescript
import { MCPClient } from '@mcp-assistant/mcp-redis/server';

export async function handleOAuthCallback(code: string, state: string) {
  // state contains sessionId and other metadata
  const { sessionId, serverId } = JSON.parse(state);

  const client = new MCPClient({
    userId: 'user-123',
    sessionId,
    serverId,
  });

  // Exchange code for tokens
  await client.finishAuth(code);

  // Now connected and tokens are saved in Redis
  const tools = await client.listTools();
  return tools;
}
```

### Client-Side API

#### useMcp Hook

```typescript
import { useMcp } from '@mcp-assistant/mcp-redis/client';

const {
  // State
  connections,      // Array of all connections
  status,          // SSE connection status
  isInitializing,  // Loading initial sessions

  // Actions
  connect,         // Connect to a new MCP server
  disconnect,      // Disconnect from a server
  refresh,         // Reload all sessions
  connectSSE,      // Manually connect SSE
  disconnectSSE,   // Manually disconnect SSE
  finishAuth,      // Complete OAuth authorization

  // Tool Operations
  callTool,        // Call a tool from a session
  listTools,       // List available tools for a session

  // Prompt Operations
  listPrompts,     // List available prompts for a session
  getPrompt,       // Get a specific prompt with arguments

  // Resource Operations
  listResources,   // List available resources for a session
  readResource,    // Read a specific resource

  // Utilities
  getConnection,         // Get connection by sessionId
  getConnectionByServerId, // Get connection by serverId
  isServerConnected,    // Check if server is connected
  getTools,            // Get tools for a session
} = useMcp({
  url: '/api/mcp/sse',
  userId: 'user-123',
  authToken: 'optional-token',
  autoConnect: true,      // Auto-connect SSE on mount
  autoInitialize: true,   // Auto-load sessions on mount
  onConnectionEvent: (event) => {
    // Handle connection events
    console.log('Connection event:', event);
  },
  onLog: (level, message, metadata) => {
    // Handle debug logs
    console.log(`[${level}] ${message}`, metadata);
  },
});
```

#### SSEClient (Lower-Level)

```typescript
import { SSEClient } from '@mcp-assistant/mcp-redis/client';

const client = new SSEClient({
  url: '/api/mcp/sse',
  userId: 'user-123',
  onConnectionEvent: (event) => {
    switch (event.type) {
      case 'state_changed':
        console.log('State:', event.state);
        break;
      case 'tools_discovered':
        console.log('Tools:', event.tools);
        break;
      case 'auth_required':
        window.location.href = event.authUrl;
        break;
    }
  },
  onStatusChange: (status) => {
    console.log('SSE Status:', status);
  },
});

// Connect to SSE endpoint
client.connect();

// Get all sessions
const sessions = await client.getSessions();

// Connect to a server
const result = await client.connectToServer({
  serverId: 'server-id',
  serverName: 'My Server',
  serverUrl: 'https://mcp.example.com',
  callbackUrl: window.location.origin + '/oauth/callback',
});

// List tools
const tools = await client.listTools(sessionId);

// Call a tool
const toolResult = await client.callTool(sessionId, 'tool_name', {
  arg1: 'value',
});

// List prompts
const prompts = await client.listPrompts(sessionId);

// Get a prompt
const prompt = await client.getPrompt(sessionId, 'prompt_name', {
  arg1: 'value',
});

// List resources
const resources = await client.listResources(sessionId);

// Read a resource
const resource = await client.readResource(sessionId, 'file://path/to/resource');

// Disconnect
await client.disconnectFromServer(sessionId);

// Close SSE connection
client.disconnect();
```

### Calling Tools

Once connected to an MCP server, you can call tools using the `callTool` method.

#### Using the useMcp Hook

```typescript
import { useMcp } from '@mcp-assistant/mcp-redis/client';

function ToolCaller() {
  const { connections, callTool } = useMcp({
    url: '/api/mcp',
    userId: 'user-123',
  });

  const executeWeatherTool = async () => {
    // Get the first connected session
    const connection = connections.find(c => c.state === 'CONNECTED');

    if (!connection) {
      console.error('No connected sessions');
      return;
    }

    try {
      // Call the tool with arguments
      const result = await callTool(
        connection.sessionId,
        'get_weather',
        {
          location: 'San Francisco',
          units: 'celsius',
        }
      );

      console.log('Weather data:', result);
    } catch (error) {
      console.error('Tool call failed:', error);
    }
  };

  return (
    <div>
      {connections.map(conn => (
        <div key={conn.sessionId}>
          <h3>{conn.serverName}</h3>
          {conn.tools.map(tool => (
            <button
              key={tool.name}
              onClick={() => callTool(conn.sessionId, tool.name, {})}
            >
              {tool.name}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
```

#### Calling Multiple Tools in Sequence

```typescript
const performAnalysis = async (sessionId: string) => {
  try {
    // Step 1: Fetch data
    const data = await callTool(sessionId, 'fetch_data', {
      source: 'api',
    });

    // Step 2: Process data
    const processed = await callTool(sessionId, 'process_data', {
      data: data.result,
      format: 'json',
    });

    // Step 3: Save results
    const saved = await callTool(sessionId, 'save_results', {
      results: processed,
      filename: 'analysis.json',
    });

    console.log('Analysis complete:', saved);
  } catch (error) {
    console.error('Analysis failed:', error);
  }
};
```

#### Tool Arguments and Schema

Tools have a defined schema that describes their arguments:

```typescript
// Access tool schema
const connection = connections[0];
const tool = connection.tools.find(t => t.name === 'my_tool');

if (tool?.inputSchema) {
  console.log('Tool properties:', tool.inputSchema.properties);
  console.log('Required fields:', tool.inputSchema.required);
}

// Validate arguments before calling
const validateArgs = (tool: ToolInfo, args: any) => {
  const required = tool.inputSchema?.required || [];
  for (const field of required) {
    if (!(field in args)) {
      throw new Error(`Missing required field: ${field}`);
    }
  }
};
```

#### Error Handling for Tool Calls

```typescript
const safeToolCall = async (
  sessionId: string,
  toolName: string,
  args: Record<string, unknown>
) => {
  try {
    const result = await callTool(sessionId, toolName, args);
    return { success: true, data: result };
  } catch (error) {
    console.error(`Tool ${toolName} failed:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};

// Usage
const result = await safeToolCall(sessionId, 'get_user', { userId: 123 });

if (result.success) {
  console.log('User data:', result.data);
} else {
  console.error('Failed:', result.error);
}
```

### Working with Prompts

MCP servers can provide reusable prompts with dynamic arguments.

#### List Available Prompts

```typescript
const { listPrompts, getPrompt } = useMcp({ ... });

// List all prompts
const { prompts } = await listPrompts(sessionId);

prompts.forEach(prompt => {
  console.log(`Prompt: ${prompt.name}`);
  console.log(`Description: ${prompt.description}`);
  console.log(`Arguments:`, prompt.arguments);
});
```

#### Get a Prompt with Arguments

```typescript
// Get a prompt with specific arguments
const prompt = await getPrompt(
  sessionId,
  'code-review',
  {
    language: 'typescript',
    style: 'detailed',
    focus: 'security'
  }
);

// Use the prompt messages
prompt.messages.forEach(msg => {
  console.log(`${msg.role}: ${msg.content.text}`);
});
```

### Working with Resources

MCP servers can expose resources (files, data, etc.) that can be read by clients.

#### List Available Resources

```typescript
const { listResources, readResource } = useMcp({ ... });

// List all resources
const { resources } = await listResources(sessionId);

resources.forEach(resource => {
  console.log(`Resource: ${resource.name}`);
  console.log(`URI: ${resource.uri}`);
  console.log(`Type: ${resource.mimeType}`);
});
```

#### Read Resource Content

```typescript
// Read a specific resource
const resource = await readResource(sessionId, 'file:///path/to/file.txt');

// Access the resource content
resource.contents.forEach(content => {
  if (content.text) {
    console.log('Text content:', content.text);
  }
  if (content.blob) {
    console.log('Binary content:', content.blob);
  }
});
```

#### Example: Load Configuration from Resource

```typescript
const loadConfig = async (sessionId: string) => {
  try {
    // Read config resource
    const resource = await readResource(sessionId, 'config://app.json');

    // Parse JSON content
    const config = JSON.parse(resource.contents[0].text);

    console.log('Config loaded:', config);
    return config;
  } catch (error) {
    console.error('Failed to load config:', error);
    throw error;
  }
};
```

## Connection States

Connections progress through the following states:

```typescript
type McpConnectionState =
  | 'DISCONNECTED'      // Not connected
  | 'CONNECTING'        // Initial connection attempt
  | 'AUTHENTICATING'    // OAuth flow in progress
  | 'AUTHENTICATED'     // OAuth complete
  | 'DISCOVERING'       // Fetching tools
  | 'CONNECTED'         // Fully connected with tools
  | 'VALIDATING'        // Validating existing session
  | 'RECONNECTING'      // Attempting reconnect
  | 'FAILED';           // Connection error
```

## Events

The system emits various events for observability:

```typescript
type McpConnectionEvent =
  | { type: 'state_changed'; sessionId: string; state: McpConnectionState; ... }
  | { type: 'tools_discovered'; sessionId: string; tools: Tool[]; ... }
  | { type: 'auth_required'; sessionId: string; authUrl: string; ... }
  | { type: 'error'; sessionId: string; error: string; ... }
  | { type: 'disconnected'; sessionId: string; reason?: string; ... }
  | { type: 'progress'; sessionId: string; message: string; ... };
```

## Configuration

### Environment Variables

```bash
# Redis connection
REDIS_URL=redis://localhost:6379/0

# Optional: Redis configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your-password
REDIS_DB=0
```

### Redis Schema

Sessions are stored with the following structure:

**Key**: `mcp:session:{sessionId}`
**TTL**: 43200 seconds (12 hours)
**Value**:
```json
{
  "sessionId": "abc123",
  "userId": "user-123",
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

**User Index**: `mcp:user:{userId}:sessions` (set of sessionIds)

## TypeScript Support

The package is fully typed. Import types as needed:

```typescript
// Connection events and states
import type {
  McpConnectionEvent,
  McpConnectionState,
  McpObservabilityEvent,
} from '@mcp-assistant/mcp-redis/shared';

// Tool information
import type { ToolInfo } from '@mcp-assistant/mcp-redis/shared';

// RPC types
import type {
  McpRpcRequest,
  McpRpcResponse,
} from '@mcp-assistant/mcp-redis/shared';

// OAuth types (from MCP SDK)
import type {
  OAuthTokens,
  OAuthClientInformation,
} from '@mcp-assistant/mcp-redis/server';
```

## Examples

### Next.js Full Integration

```typescript
// app/api/mcp/route.ts
import { createNextMcpHandler } from '@mcp-assistant/mcp-redis/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const { GET, POST } = createNextMcpHandler({
  // Optional: customize authentication
  authenticate: async (userId, token) => {
    // Verify token with your auth system
    return true; // or check against your database
  },

  // Optional: customize user ID extraction
  getUserId: (request) => {
    return new URL(request.url).searchParams.get('userId');
  },

  // Optional: customize auth token extraction
  getAuthToken: (request) => {
    return request.headers.get('authorization');
  },

  // Optional: heartbeat interval (default: 30000ms)
  heartbeatInterval: 30000,
});
```

```typescript
// app/components/McpConnections.tsx
'use client';

import { useMcp } from '@mcp-assistant/mcp-redis/client';

export function McpConnections({ userId }: { userId: string }) {
  const { connections, connect, disconnect, status } = useMcp({
    url: `/api/mcp/sse?userId=${userId}`,
    userId,
  });

  return (
    <div>
      <h2>MCP Connections ({status})</h2>
      {connections.map((conn) => (
        <div key={conn.sessionId}>
          <h3>{conn.serverName}</h3>
          <p>State: {conn.state}</p>
          <p>Tools: {conn.tools.length}</p>
        </div>
      ))}
    </div>
  );
}
```

## Error Handling

```typescript
import { UnauthorizedError } from '@mcp-assistant/mcp-redis/server';

try {
  await client.connect();
} catch (error) {
  if (error instanceof UnauthorizedError) {
    // Redirect to OAuth
    window.location.href = error.authUrl;
  } else if (error.message === 'Session not found') {
    // Session expired
    console.error('Session expired, please reconnect');
  } else {
    // Other errors
    console.error('Connection failed:', error);
  }
}
```

## Best Practices

1. **Always handle OAuth redirects**: Listen for `auth_required` events
2. **Validate sessions on load**: Use `restoreSession` to validate stored sessions
3. **Handle SSE reconnection**: Show UI feedback during reconnection
4. **Use error boundaries**: Wrap SSE connections in React error boundaries
5. **Clean up on unmount**: The `useMcp` hook handles this automatically
6. **Monitor heartbeats**: Set appropriate heartbeat intervals for your use case
7. **Check connection state before calling tools**: Ensure `state === 'CONNECTED'` before calling `callTool`
8. **Validate tool arguments**: Check tool schema and required fields before execution
9. **Handle tool errors gracefully**: Wrap `callTool` in try-catch blocks for better error handling

## Troubleshooting

### Redis Connection Issues
- Ensure Redis is running: `redis-cli ping`
- Check `REDIS_URL` environment variable
- Verify network connectivity

### SSE Not Connecting
- Check browser console for CORS errors
- Verify endpoint URL is correct
- Ensure auth token is passed if required

### OAuth Flow Broken
- Check callback URL matches server configuration
- Verify state parameter is preserved
- Ensure session exists in Redis during callback

## Contributing

Contributions are welcome! Please read CLAUDE.md for development guidelines.

## License

MIT © MCP Assistant Contributors

## Attribution

This library was developed with assistance from Claude (Anthropic's AI assistant). The architecture was inspired by:
- [Cloudflare's agents pattern](https://github.com/cloudflare/agents) - Observable state management
- [MCP SDK](https://github.com/modelcontextprotocol/sdk) - OAuth 2.0 flows and protocol implementation
- Modern npm packaging best practices - Dual ESM/CJS exports with proper TypeScript support

## Links

- [npm Package](https://www.npmjs.com/package/@mcp-assistant/mcp-redis)
- [GitHub Repository](https://github.com/yourusername/mcp-redis)
- [Issues](https://github.com/yourusername/mcp-redis/issues)
- [MCP Protocol](https://modelcontextprotocol.io)
