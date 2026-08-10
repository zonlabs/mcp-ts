# Developer Guide (@mcp-ts/sdk)

## Overview
`@mcp-ts/sdk` is a TypeScript SDK for building Model Context Protocol (MCP) applications with support for streamed HTTP RPC, OAuth 2.1, multiple storage backends, MCP Apps, and production-ready integrations.

## Architecture

### 1. Server (`src/server/`)
- **`MultiSessionClient`**: Core class managing multiple MCP server connections.
- **`storage/`**: Pluggable storage backends (Redis, SQLite, File, Memory, Supabase, Neon).
- **`handlers/sse-handler.ts`**: Handles streamed responses and RPC over HTTP POST for standard Node runtimes.
- **`handlers/nextjs-handler.ts`**: App Router handler for Next.js deployments.
- **`mcp/oauth-client.ts`**: Handles OAuth 2.1 authentication flows.
- **`bin/`**: Command-line tools for initialization and setup.

### 2. Client (`src/client/`)
- **`react/`**: React hook, OAuth popup helpers, and MCP App renderer exports.
- **`vue/`**: Vue 3 composables for framework integration.
- **`core/sse-client.ts`**: Browser-side streamed RPC client and event transport.
- **`core/app-host.ts`**: MCP Apps host for sandboxed UI rendering.

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
- **Supabase**: PostgreSQL-backed with RLS policies and migrations (`@supabase/supabase-js`).
- **Neon**: Serverless Postgres via HTTP queries (`@neondatabase/serverless`).
- **SQLite**: Local persistent, zero-config (`better-sqlite3`).
- **File**: Local JSON file (`fs`).
- **Memory**: Ephemeral testing (default).

Each backend implements `init()` for health checks and runtime validation.

## Core Design Patterns

### Streamed RPC Transport
- **Server -> Client**: Connection and observability events stream back in the RPC response.
- **Client -> Server**: Standard HTTP POST for RPC calls.
- **Statelessness**: Session state is reconstructed from storage; server instances are ephemeral.

### Dependency Management
- **Core**: Minimal dependencies (`nanoid`, `@modelcontextprotocol/client`, `@modelcontextprotocol/core`).
- **Adapters/Storage**: Optional peer dependencies (for example `ai`, `langchain`, `better-sqlite3`, `@supabase/supabase-js`, `@neondatabase/serverless`).
- **Dynamic Imports**: Used to load adapters and storage implementations only when requested.


### MCP SDK v2 Protocol Support
- `McpSdkClientOptions` is exported from `@mcp-ts/sdk/server` as the supported allowlist of official SDK client options.
- `normalizeMcpSdkClientOptions()` defaults `versionNegotiation` to `{ mode: 'auto' }` and does not inject SDK capabilities.
- Sessions persist Cloudflare-style `serverOptions`: `client`, `transport`, and `discoverResult` in one JSON object.
- Restored clients pass `connect({ prior })` when protocol metadata is available.
- `responseCacheStore` is runtime-only. Persist `cachePartition` and `defaultCacheTtlMs`, and let callers provide the live store object again.
- Automatic SSE fallback is disabled. Explicit `transport: { type: 'sse' }` is required for SSE.

### Storage Backend Initialization
- All backends implement `init()` for health checks.
- Standardized logging uses the `[mcp-ts][Storage]` prefix.
- Auto-detection supports Redis, file, SQLite, Supabase, and Neon via environment variables.
- Durable SQL backends validate required tables at startup.

## Development

### Commands
```bash
npm run build       # Build all entry points (tsup)
npm run type-check  # Verify types
npm run dev         # Watch mode
npm test            # Run Playwright tests
```

### Key Conventions
- **Imports**: Use explicit `.js` extensions for ESM compatibility when modifying imports.
- **Exports**: Define exports in both `package.json` and `tsup.config.ts`.
- **Client imports**: React APIs live under `@mcp-ts/sdk/client/react`; Vue APIs live under `@mcp-ts/sdk/client/vue`.
- **Testing**: Use `playwright` for e2e and integration tests in `tests/`.

## Common Tasks

### Adding a Storage Backend
1. Implement the `SessionStore` interface in `src/server/storage/`.
2. Add an `init()` method for health checks.
3. Add dynamic import logic in `src/server/storage/index.ts`.
4. Add peer dependency metadata to `package.json` if needed.
5. Add tests in `tests/`.

### Setting Up Supabase Storage
1. Run `npx mcp-ts supabase-init` to eject migrations.
2. Set `SUPABASE_URL` and `SUPABASE_SECRET_KEY`.
3. Storage is auto-detected and initialized on startup.

### Setting Up Neon Storage
1. Run the migration in `migrations/neon/20260513010000_install_mcp_sessions.sql`.
2. Set `MCP_TS_STORAGE_TYPE=neon` and `NEON_DATABASE_URL`.
3. Prefer a dedicated least-privilege database role in production.

### Adding an Adapter
1. Create `src/adapters/<name>-adapter.ts`.
2. Implement conversion from `MCPClient` or `MultiSessionClient` tools to the target framework format.
3. Add peer dependency metadata in `package.json`.
4. Add tests in `tests/`.
