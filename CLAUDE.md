# Developer Guide (@mcp-ts/sdk)

## Overview
`@mcp-ts/sdk` is a TypeScript SDK for building Model Context Protocol (MCP) clients with support for **Server-Sent Events (SSE)**, **OAuth 2.1**, and flexible storage backends.

## Architecture

### 1. Server (`src/server/`)
- **`MultiSessionClient`**: Core class managing multiple MCP server connections.
- **`storage/`**: Pluggable storage backends (Redis, SQLite, File, Memory).
- **`sse-handler.ts`**: Handles SSE streams and RPC over HTTP POST.
- **`oauth-client.ts`**: Handles OAuth 2.1 authentication flows.

### 2. Client (`src/client/`)
- **`useMcp.ts`**: React hook for connection management and UI updates.
- **`sse-client.ts`**: Browser-side client for SSE/RPC communication.
- **`agui-subscriber.ts`**: Framework-agnostic AG-UI event subscriber for MCP apps.
- **`use-agui-subscriber.ts`**: React hooks for AG-UI subscriber pattern.

### 3. Adapters (`src/adapters/`)
Bridges for agent frameworks (optional peer dependencies):
- **`ai-adapter.ts`**: Vercel AI SDK integration.
- **`langchain-adapter.ts`**: LangChain.js integration.
- **`mastra-adapter.ts`**: Mastra framework integration.
- **`agui-adapter.ts`**: AG-UI tool adapter for converting MCP tools.
- **`agui-middleware.ts`**: AG-UI middleware for server-side MCP tool execution.

### 4. Storage Backends
Configured via `MCP_TS_STORAGE_TYPE` or auto-detected:
- **Redis**: Persistent, production-ready (`ioredis`).
- **SQLite**: Local persistent, zero-config (`better-sqlite3`).
- **File**: Local JSON file (`fs`).
- **Memory**: Ephemeral testing (default).

## core Design Patterns

### Real-Time Updates (SSE)
- **Server -> Client**: Unidirectional SSE stream (tools, logs, state).
- **Client -> Server**: Standard HTTP POST for RPC calls.
- **Statelessness**: Session state reconstructed from storage; server instances are ephemeral.

### Dependency Management
- **Core**: Minimal dependencies (`nanoid`, `@modelcontextprotocol/sdk`).
- **Adapters/Storage**: **Optional Peer Dependencies** (e.g., `ai`, `langchain`, `better-sqlite3`).
- **Dynamic Imports**: Used to load adapters/storage implementations only when requested.

### AG-UI Subscriber Pattern (MCP Apps)
- **Framework-Agnostic**: Works with any AG-UI agent (HttpAgent, LangGraphAgent, etc.)
- **No CopilotKit Dependency**: Uses AG-UI's native subscriber API directly
- **Event-Driven**: Listens for tool call events and custom 'mcp-apps-ui' events
- **State Management**: Built-in `McpAppEventManager` for React integration
- **See**: `src/client/react/AGUI_SUBSCRIBER.md` for detailed documentation

## Development

### Commands
```bash
npm run build       # Build all entry points (tsup)
npm run type-check  # Verify types
npm run dev         # Watch mode
npm test            # Run tests
```

### Key Conventions
- **Imports**: modifying imports? Use explicit extensions `.js` for ESM compatibility.
- **Exports**: modifying exports? define exports in `package.json` and `tsup.config.ts`.
- **Testing**: Use `playwright` for e2e/integration tests in `tests/`.

## Common Tasks

### Adding a Storage Backend
1. Implement `StorageBackend` interface in `src/server/storage/`.
2. Add dynamic import logic in `src/server/storage/index.ts`.
3. Add peer dependency to `package.json`.

### Adding an Adapter
1. Create `src/adapters/<name>-adapter.ts`.
2. Implement conversion from `MultiSessionClient` tools to target framework format.
3. Add peer dependency meta in `package.json`.
