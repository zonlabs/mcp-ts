# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MCP Assistant is a web-based client for connecting to and interacting with remote MCP (Model Context Protocol) servers. It provides a user-friendly interface for managing MCP server connections, discovering tools, and using AI assistants powered by LangGraph to interact with those tools. The application supports OAuth 2.0 authentication for MCP servers and uses Supabase for user authentication.

## Tech Stack

- **Framework**: Next.js 15 (App Router) with React 19
- **Language**: TypeScript 5
- **UI Components**: Radix UI primitives via shadcn/ui
- **Styling**: Tailwind CSS 4
- **AI/Agent**: Assistant UI (@assistant-ui/react) + LangGraph SDK
- **Authentication**: Supabase Auth
- **Database**: Supabase (PostgreSQL)
- **Session Store**: Redis (optional, for MCP OAuth session persistence)
- **MCP Client**: @modelcontextprotocol/sdk

## Development Commands

**Install dependencies:**
```bash
npm install
```

**Run development server:**
```bash
npm run dev
```

**Build for production:**
```bash
npm run build
```

**Start production server:**
```bash
npm start
```

**Run linting:**
```bash
npm run lint
```

## Environment Variables

Create a `.env.local` file based on `.env.example`:

```bash
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

# LangGraph Configuration
NEXT_PUBLIC_LANGGRAPH_API_URL=http://localhost:8123
NEXT_PUBLIC_LANGGRAPH_ASSISTANT_ID=agent

# Redis (Optional - for MCP OAuth session persistence)
REDIS_URL=redis://localhost:6379/0

# MCP Registry API (Optional - for enhanced registry features)
MCP_REGISTRY_API_KEY=your_registry_api_key_here
```

## Architecture

### MCP Connection System

The application uses a client-side MCP connection architecture that supports OAuth 2.0 authentication:

**Core MCP Libraries (`lib/mcp/`):**
- `oauth-client.ts` - MCPOAuthClient that manages connections to MCP servers with OAuth 2.0 support
- `oauth-provider.ts` - InMemoryOAuthClientProvider handles OAuth token management and refresh
- `session-store.ts` - SessionStore manages MCP sessions in Redis with 12-hour TTL
- `connection-store.ts` - ConnectionStore manages active connections in localStorage (client-side)
- `config.ts` - Configuration utilities for MCP servers
- `types.ts` - TypeScript types for MCP servers, tools, and sessions

**Transport Support:**
The system supports two MCP transport types:
- **SSE (Server-Sent Events)** - Unidirectional streaming from server to client
- **Streamable HTTP** - Bidirectional HTTP streaming

### OAuth Flow

1. **Connect Request** (`/api/mcp/auth/connect`):
   - User provides server URL and callback URL
   - MCPOAuthClient attempts connection
   - If OAuth required, returns authorization URL
   - Session data stored in Redis with sessionId

2. **OAuth Redirect**:
   - User redirected to MCP server's OAuth authorization endpoint
   - Authorization includes state parameter with sessionId and server metadata

3. **OAuth Callback** (`/api/mcp/auth/callback`):
   - MCP server redirects back with authorization code
   - Code exchanged for access/refresh tokens
   - Session updated with tokens in Redis
   - Client marks connection as active in localStorage

4. **Token Refresh**:
   - OAuth provider automatically refreshes expired tokens
   - New tokens persisted to Redis via `onSaveTokens` callback

### Session Management

**Redis Session Store** (`lib/mcp/session-store.ts`):
- Sessions stored with key pattern: `mcp:session:{sessionId}`
- TTL: 12 hours (43200 seconds)
- Stores: serverUrl, callbackUrl, transportType, tokens, clientInformation, userId
- User sessions indexed: `mcp:user:{userId}:sessions` (set of sessionIds)

**LocalStorage Connection Store** (`lib/mcp/connection-store.ts`):
- Client-side connection state management
- Key: `mcp_connections`
- Stores: sessionId, serverId, serverName, connectionStatus, tools, connectedAt
- Auto-expires connections after 12 hours
- Progressive validation: validates each connection and notifies subscribers incrementally

### AI Assistant System

**Assistant UI Integration** (`app/(main)/(playground-app)/chat/`):
- Uses `@assistant-ui/react` for chat interface
- LangGraph runtime via `@assistant-ui/react-langgraph`
- Thread-based conversation management
- Streaming message support

**LangGraph Backend** (`lib/chatApi.ts`):
- Connects to LangGraph API (configurable via `NEXT_PUBLIC_LANGGRAPH_API_URL`)
- Thread creation, state management, and message streaming
- Assistant ID configurable via `NEXT_PUBLIC_LANGGRAPH_ASSISTANT_ID`

**Assistant Management**:
- Multiple assistant types: orchestrator, specialist, custom
- Assistant configuration stored in database

### Database Schema (Supabase)

**Key Tables:**
- `assistants` - AI assistant configurations
- `mcp_servers` - User-saved MCP server configurations
- `categories` - Server categorization

**Authentication:**
- Supabase Auth for user management
- Server-side auth via `lib/supabase/server.ts`
- Client-side auth via `lib/supabase/client.ts`

## API Routes

### MCP Management
- `GET /api/mcp` - Public MCP catalog (REST: `servers`, `totalCount`, `pageInfo`; query: `first`, `after`, `orderBy`, `categorySlug`, `search`, `featured`, `public`)
- `GET /api/mcp/user` - Current user's saved servers (`{ servers }`)
- `POST /api/mcp/servers` - Create/update server (`{ server }`)
- `DELETE /api/mcp/servers` - Delete server (`id` or `name` query param)
- `GET /api/categories` - MCP categories (`{ categories }`)
- `POST /api/mcp/auth/connect` - Initiate MCP server connection (returns authUrl if OAuth required)
- `GET /api/mcp/auth/callback` - OAuth callback handler (completes OAuth flow)
- `POST /api/mcp/auth/disconnect` - Disconnect from MCP server
- `GET /api/mcp/tool/list` - List tools from connected MCP server
- `POST /api/mcp/tool/call` - Execute tool on connected MCP server
- `GET /api/mcp/connections` - Get all active MCP connections
- `POST /api/mcp/actions` - Perform actions on MCP servers

### Registry
- `GET /api/registry` - Fetch MCP servers from registry
- `POST /api/registry/publish` - Publish server to registry

## Key Implementation Patterns

### Serverless-Friendly MCP Sessions

The application is designed for Vercel/serverless deployment:
- **Stateless API routes**: Each request reconstructs MCP client from Redis session
- **Session restoration**: `sessionStore.getClient(sessionId)` rebuilds MCPOAuthClient with stored tokens
- **Automatic token refresh**: OAuth provider handles token expiration transparently
- **Redis persistence**: Connection state survives across serverless function invocations

Example pattern in API routes:
```typescript
const sessionData = await sessionStore.getSession(sessionId);
const client = await sessionStore.getClient(sessionId);
const tools = await client.listTools();
// Client automatically handles token refresh if needed
```

### Connection Validation

Connections are validated progressively on app load:
- `connectionStore.validateConnections()` validates each stored connection
- Calls `/api/mcp/tool/list` to verify server accessibility
- Updates connection status and tools incrementally
- Notifies UI subscribers after each validation (progressive rendering)
- Removes expired/failed connections automatically

### Multi-Server Tool Loading

The playground supports multiple connected MCP servers:
- User selects which servers to use (stored in assistant config)
- Tools loaded from `mcpSessions` array in agent state
- Each session maps to a connected MCP server with sessionId
- LangGraph agent receives combined tool list from all selected servers

### OAuth State Management

State parameter in OAuth flow carries metadata:
```typescript
const stateData = JSON.stringify({
  sessionId,      // Session identifier
  serverId,       // Database server ID
  serverName,     // Display name
  serverUrl,      // MCP server URL
  sourceUrl       // Originating page URL
});
```

This allows the callback handler to:
- Restore the correct session
- Update the right database record
- Redirect back to the originating page

## Component Structure

### Route Groups

- `app/(main)/` - Main application routes (home, registry, MCP servers, etc.)
- `app/(main)/(playground-app)/` - Playground chat interface with assistants
- `app/api/` - API routes for MCP, registry

### Key Components

- `components/playground/` - Playground chat UI components
- `components/providers/` - React context providers (Auth, Theme, Playground)
- `components/ui/` - shadcn/ui base components

### Providers

- `AuthProvider` - Supabase authentication context
- `ThemeProvider` - next-themes for dark/light mode
- `PlaygroundProvider` - Assistant and playground state management
- `AssistantRuntimeProvider` - Assistant UI runtime for chat

## Type Safety

### Core Types (`types/mcp.ts`)

- `McpServer` - Server configuration
- `ToolInfo` - Tool metadata (name, description, schema)
- `ConnectionResult` - Connection status response
- `Assistant` - AI assistant configuration
- `AgentState` - LangGraph agent state (includes mcpSessions, model, provider, apiKey)
- `McpConfig` - Client-side MCP configuration (transport, url, sessionId - no credentials)
- `McpServerConfig` - Server-side MCP configuration (includes credentials/headers)

### Session Types (`lib/mcp/session-store.ts`)

- `SessionData` - Redis session data structure
- `SetClientOptions` - Options for storing client sessions

## Redis Setup

Redis is optional but recommended for production:

**Without Redis:**
- Sessions stored in-memory (cleared on server restart)
- Each API route invocation requires fresh OAuth connection
- Not suitable for serverless deployments

**With Redis:**
- Sessions persist across server restarts
- OAuth tokens cached and automatically refreshed
- Serverless-friendly architecture
- User sessions maintained with TTL

**Install Redis:**
```bash
# macOS
brew install redis
redis-server

# Windows
choco install redis-64
redis-server

# Linux
sudo apt install redis-server
sudo systemctl start redis
```

**Verify Redis:**
```bash
redis-cli ping  # Should return PONG
```

## LangGraph Backend Setup

The application requires a LangGraph backend for AI assistant functionality:

1. **LangGraph Server**: Deploy a LangGraph application with MCP tool support
2. **Configuration**: Set `NEXT_PUBLIC_LANGGRAPH_API_URL` to your LangGraph API endpoint
3. **Assistant ID**: Set `NEXT_PUBLIC_LANGGRAPH_ASSISTANT_ID` to your agent/graph name
4. **MCP Integration**: LangGraph agent should accept `mcpSessions` in config and load tools dynamically

## Common Development Tasks

### Adding a New MCP Server

1. Navigate to `/mcp` page
2. Click "Add Server"
3. Fill in server details (name, URL, transport type)
4. If OAuth required, user will be redirected to authorize
5. After authorization, connection stored in localStorage + Redis

### Testing OAuth Flow Locally

1. Ensure Redis is running: `redis-cli ping`
2. Start dev server: `npm run dev`
3. Add MCP server with OAuth in UI
4. Check Redis for session: `redis-cli GET mcp:session:{sessionId}`
5. Inspect browser localStorage for connection state

### Debugging Connection Issues

**Check session in Redis:**
```bash
redis-cli
> KEYS mcp:session:*
> GET mcp:session:{sessionId}
```

**Check localStorage:**
```javascript
// In browser console
localStorage.getItem('mcp_connections')
```

**Check server logs:**
- API routes log OAuth flow steps
- Look for "OAuth Client" prefixed logs
- Check token refresh attempts

## Troubleshooting

**"Session not found" errors:**
- Check Redis connection: `redis-cli ping`
- Verify session hasn't expired (12-hour TTL)
- Check `REDIS_URL` environment variable

**OAuth authorization loop:**
- Clear localStorage: `localStorage.removeItem('mcp_connections')`
- Clear Redis session: `redis-cli DEL mcp:session:{sessionId}`
- Check callback URL matches MCP server configuration

**Token refresh failures:**
- Ensure MCP server supports refresh tokens
- Check server implements RFC 8414 OAuth discovery
- Verify `refresh_token` is present in session data

**Connection validation fails:**
- Check `/api/mcp/tool/list` endpoint directly
- Verify server is accessible from your network
- Check for CORS issues in browser console

**Serverless deployment issues:**
- Ensure Redis is accessible from serverless functions
- Check Redis connection timeout settings
- Verify environment variables are set in deployment platform
