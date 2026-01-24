# MCP Redis - Next.js Full-Stack Example

This example demonstrates a complete full-stack implementation of `@mcp-ts/redis` in a Next.js application, including both server-side SSE handling and client-side React integration.

## What This Example Shows

### Server-Side
- SSE endpoint implementation using Next.js API routes
- Redis-backed session management
- RPC request handling (connect, disconnect, tool execution)
- OAuth 2.0 flow integration
- Real-time event streaming to clients

### Client-Side
- `useMcp` React hook for connection management
- Real-time UI updates via SSE
- Tool discovery and display
- Connection state management
- Error handling and user feedback

## Project Structure

```
examples/nextjs/
├── app/
│   ├── api/
│   │   └── mcp/
│   │       └── route.ts              # SSE endpoint & RPC handler
│   ├── components/
│   │   ├── McpDashboard.tsx          # Main container
│   │   ├── McpDashboard.module.css   # Component styles
│   │   └── dashboard/                # Dashboard sub-components
│   │       ├── ConnectForm.tsx       # Connection form
│   │       ├── ConnectionList.tsx    # List of active connections
│   │       ├── ConnectionItem.tsx    # Individual connection item
│   │       ├── ToolExecutor.tsx      # Tool execution modal
│   │       └── useOAuthPopup.ts      # OAuth logic hook
│   ├── layout.tsx                     # Root layout
│   ├── page.tsx                       # Home page
│   └── globals.css                    # Global styles
├── .env.example                       # Environment variables template
├── next.config.js                     # Next.js configuration
├── tsconfig.json                      # TypeScript configuration
├── package.json                       # Dependencies
└── README.md                          # This file
```

## Prerequisites

1. **Node.js**: Version 18 or higher
2. **Redis Server**: Running and accessible
3. **MCP Server**: An MCP-compliant server to connect to

## Installation

### Using Local Package (Development)

1. **Build the main package** (from repository root):
   ```bash
   cd ../..
   npm run build
   ```

2. **Install dependencies**:
   ```bash
   cd examples/nextjs
   npm install
   ```

3. **Set up environment variables**:
   ```bash
   cp .env.example .env
   ```

4. **Configure Redis** in `.env`:
   ```env
   REDIS_URL=redis://localhost:6379
   ```

**Note**: The example is configured to use the local package via `"@mcp-ts/redis": "file:../.."` in package.json. Whenever you make changes to the main package, rebuild it before testing.

## Running the Example

### Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Production Build

```bash
npm run build
npm start
```

## How It Works

### Server-Side: SSE Endpoint (`app/api/mcp/route.ts`)

The API route handles both SSE connections and RPC requests:

```typescript
import { createSSEHandler } from '@mcp-ts/redis/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const identity = searchParams.get('identity');

  const handler = createSSEHandler({
    identity,
    heartbeatInterval: 30000,
  });

  // Stream events to client
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
    },
  });
}
```

**Key Features:**
- Real-time event streaming via SSE
- Automatic heartbeat to keep connection alive
- User-specific sessions via identity
- Redis persistence for session state

### Client-Side: React Hook (`app/components/McpDashboard.tsx`)

The dashboard uses the `useMcp` hook to manage connections:

```typescript
const {
  connections,
  status,
  connect,
  disconnect,
} = useMcp({
  url: '/api/mcp',
  identity: 'demo-user-123',
  authToken: 'your-auth-token',
  autoConnect: true,
});
```

**Key Features:**
- Automatic SSE connection and reconnection
- Real-time connection state updates
- Tool discovery and listing
- OAuth flow handling
- Connection management UI

## Configuration

### Environment Variables

Create a `.env` file with:

```env
# Required
REDIS_URL=redis://localhost:6379

# Optional
REDIS_PASSWORD=your-password
NEXT_PUBLIC_API_URL=http://localhost:3000
```

### Redis Setup

Make sure Redis is running:

```bash
# macOS (Homebrew)
brew services start redis

# Linux (systemd)
sudo systemctl start redis

# Docker
docker run -p 6379:6379 redis:latest

# Windows (WSL or Docker recommended)
redis-server
```

Test Redis connection:

```bash
redis-cli ping
# Should return: PONG
```

## Using the Application

### 1. Connect to an MCP Server

Fill in the connection form with:
- **Server ID**: Unique identifier for this connection
- **Server Name**: Friendly display name
- **Server URL**: The MCP server endpoint
- **Transport Type**: Select "Auto" (default) to let the client negotiate, or force SSE/HTTP
- **OAuth Callback URL**: Where OAuth should redirect (usually your app URL + `/oauth/callback-popup` for popups or `/oauth/callback` for redirects)

Click "Connect" to initiate the connection.

### 2. OAuth Authentication

If the MCP server requires OAuth:
1. The connection will show `AUTHENTICATING` state
2. An authorization URL will be provided
3. Click the URL to complete OAuth in a new window
4. After authorization, the connection will automatically proceed

### 3. View Available Tools

Once connected (state: `CONNECTED`):
- The connection card will show all available tools
- Each tool displays its name and description
- Click "Connection Details" to see full session info

### 4. Execute Tools

Once connected:
- Click **Execute** on any tool
- Enter tool arguments as JSON in the modal (e.g., `{"location": "San Francisco"}`)
- Click **Run Tool**
- View the result in the modal

**Programmatic Usage**:
```typescript
const { callTool } = useMcp({ ... });

const result = await callTool(
  sessionId,
  'tool_name',
  { arg1: 'value1' }
);
```

### 5. Disconnect

Click the "Disconnect" button on any connection to close it. The session will be removed from Redis.

## API Reference

### SSE Events

The server streams these event types:

#### `connection`
Connection state changes:
```typescript
{
  type: 'state_changed',
  sessionId: string,
  state: McpConnectionState,
  timestamp: number
}
```

#### `tools_discovered`
When tools are loaded:
```typescript
{
  type: 'tools_discovered',
  sessionId: string,
  tools: ToolInfo[],
  timestamp: number
}
```

#### `error`
When errors occur:
```typescript
{
  type: 'error',
  sessionId: string,
  error: string,
  timestamp: number
}
```

### RPC Methods

Send POST requests to `/api/mcp` with:

#### Connect
```json
{
  "method": "connect",
  "params": {
    "serverId": "server-001",
    "serverName": "My Server",
    "serverUrl": "https://mcp.example.com",
    "callbackUrl": "http://localhost:3000/oauth/callback"
  }
}
```

#### Disconnect
```json
{
  "method": "disconnect",
  "params": {
    "sessionId": "abc123..."
  }
}
```

#### Call Tool
```json
{
  "method": "callTool",
  "params": {
    "sessionId": "abc123...",
    "toolName": "search",
    "toolArgs": { "query": "example" }
  }
}
```

## Connection States

Connections progress through these states:

| State | Description |
|-------|-------------|
| `DISCONNECTED` | Initial state, not connected |
| `CONNECTING` | Initiating connection to MCP server |
| `AUTHENTICATING` | OAuth flow in progress |
| `AUTHENTICATED` | OAuth completed successfully |
| `DISCOVERING` | Loading tools from server |
| `CONNECTED` | Fully connected and ready |
| `VALIDATING` | Validating existing session |
| `RECONNECTING` | Attempting to reconnect |
| `FAILED` | Connection failed |

## Troubleshooting

### Redis Connection Issues

**Error**: `Redis connection failed`

**Solutions**:
- Verify Redis is running: `redis-cli ping`
- Check `REDIS_URL` in `.env`
- Ensure Redis is accessible (firewall, network)

### SSE Not Connecting

**Symptoms**: Status stays on "connecting"

**Solutions**:
- Check browser console for errors
- Verify `/api/mcp` endpoint is accessible
- Ensure Next.js dev server is running
- Check for CORS issues (shouldn't be an issue with same-origin)

### Build Errors

**Error**: `Module not found: @mcp-ts/redis`

**Solution**:
```bash
npm install @mcp-ts/redis
```

**Error**: TypeScript errors

**Solution**:
```bash
npm run build
```

### OAuth Flow Issues

**Symptoms**: Connection stuck in `AUTHENTICATING`

**Solutions**:
- Verify callback URL matches MCP server configuration
- Check OAuth state parameter is preserved
- Ensure session exists in Redis during callback
- Check browser console for redirect errors

## Deployment

### Vercel

1. **Deploy to Vercel**:
   ```bash
   npm install -g vercel
   vercel
   ```

2. **Configure environment variables** in Vercel dashboard:
   - `REDIS_URL`: Your production Redis URL (consider Upstash or Redis Cloud)

3. **Important**: Vercel Serverless Functions have timeouts. For long-running SSE connections, consider Vercel Edge Runtime or alternative hosting.

### Docker

Create a `Dockerfile`:

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
```

Build and run:

```bash
docker build -t mcp-redis-nextjs .
docker run -p 3000:3000 -e REDIS_URL=redis://host.docker.internal:6379 mcp-redis-nextjs
```

### Production Considerations

1. **Redis**: Use managed Redis (Upstash, Redis Cloud, AWS ElastiCache)
2. **Authentication**: Implement proper auth (NextAuth.js, Auth0, etc.)
3. **Rate Limiting**: Add rate limiting to SSE endpoint
4. **Monitoring**: Log SSE connections and errors
5. **Scaling**: Consider Redis cluster for high availability

## Advanced Usage

### Custom Event Handling

Listen to specific events:

```typescript
const { addEventListener } = useMcp({ ... });

useEffect(() => {
  const unsubscribe = addEventListener('state_changed', (event) => {
    console.log('State changed:', event);
  });

  return unsubscribe;
}, [addEventListener]);
```

### Manual Session Management

Refresh sessions manually:

```typescript
const { refresh } = useMcp({ ... });

const handleRefresh = async () => {
  await refresh();
};
```

### Multiple Connections

Connect to multiple servers:

```typescript
await connect({
  serverId: 'server-1',
  serverName: 'Server 1',
  serverUrl: 'https://mcp1.example.com',
  callbackUrl: 'http://localhost:3000/callback',
});

await connect({
  serverId: 'server-2',
  serverName: 'Server 2',
  serverUrl: 'https://mcp2.example.com',
  callbackUrl: 'http://localhost:3000/callback',
});
```

## Learn More

- [Main Package README](../../README.md) - Full package documentation
- [CLAUDE.md](../../CLAUDE.md) - Development guide
- [MCP Specification](https://modelcontextprotocol.io) - Model Context Protocol docs
- [Next.js Documentation](https://nextjs.org/docs) - Next.js features and API

## License

MIT

## Support

For issues or questions:
- GitHub Issues: [mcp-redis/issues](https://github.com/ashen-dusk/mcp-redis/issues)
- MCP Discord: [Model Context Protocol Community](https://discord.gg/modelcontextprotocol)
