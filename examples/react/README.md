# MCP Redis - React Example

This example demonstrates how to use `@mcp-ts/sdk` in a React application with TypeScript.

## What This Example Shows

- Using the `useMcp` React hook for managing MCP connections
- Real-time connection status updates via Server-Sent Events (SSE)
- OAuth 2.1 authentication flow handling
- Discovering and calling tools from MCP servers
- Managing multiple concurrent connections
- Error handling and reconnection logic

## Project Structure

```
src/
├── App.tsx                      # Main application component
├── App.css                      # Styling
├── components/
│   ├── ConnectForm.tsx         # Form for connecting to MCP servers
│   ├── ConnectionList.tsx      # List of active connections
│   ├── ConnectionCard.tsx      # Individual connection display
│   └── ToolList.tsx           # Tool discovery and execution UI
├── main.tsx                    # React entry point
└── index.css                   # Global styles
```

## Prerequisites

1. **Backend SSE Endpoint**: You need a backend server that implements the MCP SSE protocol. See the server examples in this repository.

2. **Redis Server**: A running Redis instance for session storage.

3. **MCP Server**: An MCP-compliant server to connect to (e.g., a custom MCP server or a third-party service).

## Installation

The example already has all dependencies installed. If you need to reinstall:

```bash
npm install
```

## Configuration

Before running the example, you need to configure the backend endpoint:

1. **Update the SSE URL** in `src/App.tsx`:

```typescript
const [sseUrl] = useState('/api/mcp/sse'); // Change this to your backend URL
```

2. **Set up authentication** (if required):

```typescript
const [authToken] = useState('demo-token'); // Replace with your auth token
```

## Running the Example

### Development Server

Start the Vite development server:

```bash
npm run dev
```

The app will be available at `http://localhost:5173` (or the next available port).

### Production Build

Build for production:

```bash
npm run build
```

Preview the production build:

```bash
npm run preview
```

## How to Use

### 1. Connect to an MCP Server

1. Fill in the connection form:
   - **Server Name**: A friendly name for your connection
   - **Server URL**: The URL of the MCP server
   - **OAuth Callback URL**: Where OAuth redirects should go (usually your app URL + `/callback`)

2. Click "Connect"

3. If OAuth is required, you'll see an authorization link. Click it to complete the OAuth flow.

### 2. View Connections

Once connected, you'll see:
- Connection status (CONNECTING, AUTHENTICATING, CONNECTED, etc.)
- Session ID
- Available tools
- Connection details

### 3. Call Tools

1. Expand a connection to see available tools
2. Click on a tool to expand its details
3. View the tool's input schema
4. Enter arguments as JSON (e.g., `{"query": "example"}`)
5. Click "Call Tool" to execute
6. View the result below

### 4. Disconnect

Click the "Disconnect" button on any connection to close it.

## Key Components

### `useMcp` Hook

The main hook for managing MCP connections:

```typescript
import { useMcp } from '@mcp-ts/sdk/client';

const {
  connections,      // Array of active connections
  status,          // SSE connection status
  connect,         // Connect to a new MCP server
  disconnect,      // Disconnect from a server
  callTool,        // Execute a tool
  isConnected,     // Whether SSE is connected
} = useMcp({
  url: '/api/mcp/sse',
  identity: 'user-123',
  authToken: 'token',
  autoConnect: true,
});
```

### Connection States

Connections can be in these states:

- `DISCONNECTED` - Not connected
- `CONNECTING` - Initiating connection
- `AUTHENTICATING` - OAuth in progress
- `AUTHENTICATED` - OAuth completed
- `DISCOVERING` - Loading tools
- `CONNECTED` - Ready to use
- `VALIDATING` - Validating connection
- `RECONNECTING` - Attempting to reconnect
- `FAILED` - Connection failed

### OAuth Flow

1. Call `connect()` with server details
2. If OAuth is required, the connection will have an `authUrl`
3. User clicks the auth URL and completes OAuth
4. OAuth callback updates the session in Redis
5. Connection automatically proceeds to CONNECTED state

## Backend Setup

This example requires a backend that implements:

1. **SSE Endpoint** - Streams connection events
2. **RPC Handler** - Handles connect/disconnect/tool calls
3. **OAuth Callback** - Processes OAuth redirects
4. **Redis Session Store** - Persists connection state

Example backend setup (see `examples/server-nextjs` or `examples/server-express`):

```typescript
import { createSSEHandler } from '@mcp-ts/sdk/server';

const handler = createSSEHandler({
  identity: 'user-123',
  heartbeatInterval: 30000,
});

// Use with your framework (Express, Next.js, etc.)
```

## Environment Variables

You may want to set these in a `.env` file:

```env
VITE_SSE_ENDPOINT=/api/mcp/sse
VITE_USER_ID=demo-user-123
VITE_AUTH_TOKEN=demo-token
```

Then use them in your app:

```typescript
const [sseUrl] = useState(import.meta.env.VITE_SSE_ENDPOINT);
const [identity] = useState(import.meta.env.VITE_USER_ID);
const [authToken] = useState(import.meta.env.VITE_AUTH_TOKEN);
```

## Troubleshooting

### SSE Not Connecting

- Ensure your backend is running
- Check the SSE endpoint URL is correct
- Verify CORS is configured properly on the backend
- Check browser console for connection errors

### OAuth Not Working

- Verify the callback URL matches your backend configuration
- Check that the OAuth state parameter is preserved
- Ensure the session exists in Redis during OAuth callback

### Tools Not Loading

- Wait for the connection to reach CONNECTED state
- Check that the MCP server supports tool discovery
- Verify the MCP server is responding correctly

### Connection Keeps Reconnecting

- Check Redis connection is stable
- Verify the MCP server is accessible
- Look for errors in the browser console
- Check backend logs for issues

## Advanced Usage

### Custom Event Handling

You can listen to raw SSE events:

```typescript
const { addEventListener } = useMcp({ ... });

addEventListener('state_changed', (event) => {
  console.log('State changed:', event);
});

addEventListener('tools_discovered', (event) => {
  console.log('Tools discovered:', event.tools);
});
```

### Manual Reconnection

```typescript
const { reconnect } = useMcp({ ... });

// Manually trigger reconnection
await reconnect();
```

### Multiple Connections

The hook automatically manages multiple connections. Just call `connect()` multiple times:

```typescript
await connect({ serverName: 'Server 1', serverUrl: '...' });
await connect({ serverName: 'Server 2', serverUrl: '...' });
```

## Learn More

- [Main README](../../README.md) - Package documentation
- [CLAUDE.md](../../CLAUDE.md) - Development guide
- [Server Examples](../server-express) - Backend implementation examples

## License

MIT
