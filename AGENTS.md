# AGENTS.md — mcp-ts Monorepo

## What is this?

mcp-ts is a TypeScript monorepo for building MCP (Model Context Protocol) applications. It provides:
- `@mcp-ts/client` — core Client SDK with multi-backend session storage, OAuth 2.1, SSE handlers, React/Vue hooks, and agent framework adapters
- `@mcp-ts/tool-router` — on-demand tool discovery to reduce LLM context bloat
- `@mcp-ts/codemode` — sandboxed programmatic tool execution

The Client package is consumed by [mcp-client](https://mcp-assistant.in) (Next.js, hosted on Vercel) and [mcp-server](https://api.mcp-assistant.in/mcp) (Hono, hosted on Railway).

## Repository Structure

```
mcp-ts/
  .github/workflows/   # CI/CD — release.yml auto-publishes to npm on version bumps
  .claude/              # Claude settings
  docs/                 # Mintlify documentation (docs.mcp-assistant.in)
  benchmarks/           # tool-router performance benchmarks
  AGENTS.md             # ← this file — project guide for AI agents and contributors
  README.md             # public-facing readme (npm-published for Client)
  package.json          # npm workspace root ("workspaces": ["packages/*"])
  packages/
    client/             # @mcp-ts/client
      src/
        server/
          storage/      # pluggable backends: neon, supabase, sqlite, redis, memory, file
          mcp/          # oauth-client, storage-oauth-provider, tool-policy-gateway
          handlers/     # sse-handler, nextjs-handler
        client/
          react/        # useMcp hook, McpAppRenderer, OAuth popup
          vue/          # Vue composable
          core/         # sse-client, app-host
        adapters/       # AI SDK, LangChain, Mastra, AG-UI
        shared/         # types, events, utils, constants
        bin/            # CLI (mcp-ts supabase-init)
      tests/            # Playwright tests per-backend + integration
      migrations/       # SQL migrations (neon/, supabase/, v2.3.4/)
      tsup.config.ts    # build config (multi-entry)
      playwright.config.ts
    code-mode/          # @mcp-ts/codemode
    tool-router/        # @mcp-ts/tool-router
```

## Key Architectural Decisions

### Single-table session design

OAuth credential fields (`client_information`, `tokens`, `code_verifier`, `client_id`, `oauth_state`) live as nullable columns on `mcp_sessions`. No separate credentials table — eliminates JOINs, FK cascades, duplicate DB objects. All six backends implement this consistently.

### PKCE in-memory first

`StorageOAuthClientProvider` keeps the raw code verifier in-memory (`_codeVerifierRaw`) and the SHA-256 challenge computed in-memory. Only the verifier itself (`code_verifier`) is persisted to DB for cross-instance callback support. The challenge and nonce are in-memory only — no DB columns, no persistence overhead.

### Blob vs SQL backends

- **SQL backends** (Neon, Supabase): credential fields are separate columns. `get()` selects only non-credential columns unless `includeCredentials: true`. `patchCredentials()` does a targeted `UPDATE`.
- **Blob backends** (SQLite, Redis, Memory, File): store the full `Session` as JSON. `get()` destructures credential fields out of the returned object when `includeCredentials` is false.

Both implement the same `SessionStore` interface contract.

### SessionStore interface methods

| Method | Purpose |
|--------|---------|
| `create(session)` | Insert new session (throws on duplicate) |
| `update(userId, id, data)` | Update connection metadata |
| `patchCredentials(userId, id, data)` | Update OAuth credential fields |
| `get(userId, id, opts?)` | Get session; `includeCredentials: true` for creds |
| `getCredentials(userId, id)` | Get only credential fields |
| `clearCredentials(userId, id)` | Null all credential fields |
| `list(userId)` / `listIds(userId)` / `listAllIds()` | Enumeration |
| `delete(userId, id)` / `clearAll()` | Cleanup |
| `cleanupExpired()` | Remove stale sessions |
| `generateSessionId()` | `sess_` + 21-char nanoid |

## Local Development

```bash
# Install all workspace dependencies
cd mcp-ts && npm install

# Build the Client package
npm run build -w @mcp-ts/client

# Watch mode
npm run dev -w @mcp-ts/client

# Run all tests
npm test -w @mcp-ts/client

# Run specific tests
npx playwright test tests/storage/neon-backend.test.ts

# Type check
npm run type-check -w @mcp-ts/client
```

### Post-build sync

After building the Client package, the `postbuild` script auto-syncs `dist/` to `mcp-client/node_modules/@mcp-ts/client` via `resolve-local-pkg.cjs`. Restart the mcp-client dev server to pick up changes.

## Storage Backend Configuration

```bash
# Auto-detected from env vars. Explicit override:
MCP_TS_STORAGE_TYPE=redis|supabase|neon|sqlite|file|memory

# Backend-specific env vars:
REDIS_URL=redis://localhost:6379
SUPABASE_URL=... SUPABASE_SECRET_KEY=...
NEON_DATABASE_URL=...
MCP_TS_STORAGE_SQLITE_PATH=./sessions.db
MCP_TS_STORAGE_FILE=./sessions.json
```

## Testing

All tests use Playwright. Each storage backend has its own test file under `tests/storage/`. Mocks simulate the backend's API (Neon HTTP SQL, Supabase fluent builder, Redis ioredis, etc.).

Test utilities in `tests/test-utils.ts`: `createMockSession()`, `createMockTokens()`, `createMockClientInfo()`.

## CI/CD

`.github/workflows/release.yml` triggers on `packages/client/package.json` version bumps to `main`:
- Detects which package.json changed
- Builds the affected package
- Publishes to npm with `--provenance`
- Creates a git tag (`client-vX.Y.Z`, `tool-router-vX.Y.Z`, `codemode-vX.Y.Z`)
- Creates a GitHub Release

## Dependent Repos

- **mcp-client** (Next.js, Vercel): imports `@mcp-ts/client` from npm. Local dev uses the postbuild sync script.
- **mcp-server** (Hono, Railway): imports `@mcp-ts/client` and `@mcp-ts/codemode` from npm. For local dev, use `npm link`:
  ```bash
  cd mcp-ts/packages/client && npm link
  cd mcp-server && npm link @mcp-ts/client
  ```

## Naming Conventions

| Concept | Convention |
|---------|-----------|
| Session IDs | `sess_` + 21-char nanoid (`sess_a1b2c3d4e5f6...`) |
| Server IDs | 12-char alphanumeric (keeps tool_<sid>_<name> under 64 chars) |
| Tool IDs | `{serverId}::{toolName}` (composite format) |
| DB columns | snake_case (`session_id`, `oauth_state`) |
| JS/TS fields | camelCase (`sessionId`, `oauthState`) |
| RPC methods | camelCase (`listSessions`, `finishAuth`) |
| Env vars | `MCP_TS_` prefix, UPPER_SNAKE_CASE |
| Credential fields | Nullable on Session, never a nested object — accessed directly (`session.clientId`, not `session.credentials.clientId`) |
