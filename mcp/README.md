# MCP Server

The `mcp-server` service runs MCP Assistant's standalone HTTP MCP service.
It connects AI clients to MCP tools and remote app integrations through the Model Context Protocol.

Use it when you want an MCP client to access MCP Assistant without hosting your own MCP server.
After connecting remote MCP servers in [mcp-assistant.in](https://mcp-assistant.in/), the server can provide access to 100+ MCP servers, including GitHub, Notion, Zapier, Supabase, and other supported services.

It also exposes meta-tools for dynamic MCP discovery and a CodeMode tool that executes programs inside a secure sandbox for programmatic tool calling and result processing.
That makes it useful when a task is better handled by a small program than by an expensive LLM tool-calling loop.

## What it does

- Serves the public MCP endpoint at `POST /mcp`
- Exposes OAuth metadata and token endpoints
- Validates access tokens and scopes
- Connects clients to the MCP Assistant tool network
- Exposes meta-tools for MCP discovery and schema inspection
- Provides CodeMode execution for sandboxed programmatic tool use
- Tracks usage and session state through Supabase
- Provides a health endpoint for uptime and deploy checks

## Supported scopes

The server publishes these OAuth scopes in its discovery metadata:

- `openid`
- `email`
- `mcp:tools:read`
- `mcp:tools:execute`

Admin identities can also receive `mcp:tools:admin` internally. That scope is used for admin-only tools and is not required for normal usage.

### Built-in tools

#### Discovery tools

- `list_mcp_servers` - list connected MCP servers and their tool counts
- `search_mcp_tools` - search connected tools for a user's need
- `get_mcp_tool_schema` - inspect the exact schema for a tool

#### Code execution

- `codemode_run` - run CodeMode scripts against connected MCP servers

#### Admin tools

- `index_mcp_server` - add or update a server in the global MCP directory
- `delete_mcp_server` - remove a server from the global MCP directory
- `find_mcp_servers` - search the global MCP directory for servers to add

## Multi-Session Cache & Invalidation Flow

To optimize performance and minimize database writes, the server caches active `MultiSessionClient` instances per user using an in-memory registry. This prevents having to establish TCP connections and fetch tool schemas from downstream MCP servers (e.g. GitHub, Notion) on every single tool call.

### Caching Strategy
1. **Cache MISS (First Request):** Creates a `MultiSessionClient` entry, schedules its idle eviction timer, connects to all user-configured MCP servers, and saves the client in the memory registry.
2. **Cache HIT (Subsequent Requests):** If the cache age is below `MCP_SESSION_REFRESH_MS` (default: 30 seconds), the cached client is returned instantly with zero connection/fetch overhead.
3. **Natural TTL Expiry:** If the cache age exceeds 30 seconds, it triggers a refresh. Because the connection is not dropped, `.connect()` short-circuits instantly by reusing the active connections without writing new sessions to the database.
4. **Idle Eviction:** If a client registry entry remains idle for `MCP_CLIENT_IDLE_TTL_MS` (default: 5 minutes), the idle timer triggers a clean `disconnect()` and evicts the entry from memory to prevent file descriptor leaks.

### Realtime Invalidation Architecture
When a user updates their session configurations (e.g., adding or removing a tool), the cache must be updated. This is handled by a Supabase Realtime bridge:

* **Postgres Changes Subscription:** The bridge listens to all write events (`INSERT`, `UPDATE`, `DELETE`) on the `mcp_sessions` table.
* **RLS Delete Resolution Map:** Since Row Level Security (RLS) causes `DELETE` events to only expose the row's primary key (`id`) and hide columns like `user_id`, the server tracks a local mapping of `sessionId (UUID) -> userId` from `INSERT`/`UPDATE` events. This map is capped at `10,000` entries to prevent memory leaks under load, falling back to invalidating all entries if a UUID cannot be resolved.
* **Skip Invalidation during Connect:** Invalidation events triggered by the server's own `connect()` heartbeats are ignored to prevent self-invalidation loops.
* **Incremental Disconnect (Deletions):** When an MCP server is disconnected (`DELETE` event), the bridge resolves the specific text `sessionId` from the map and calls `removeCachedSession`. This immediately disconnects *only* the removed server and filters it from the cached registry client. The remaining active servers stay connected without interruption, making the next request a pure cache `HIT` with zero reconnect overhead.
* **Lazy Invalidation (Additions/Modifications):** When a new server is added (`INSERT`), the cache is marked stale (`lastSyncedAt = 0`) and eviction is rescheduled. Reconnecting to build the new sessions list happens lazily on the **next user request**, preventing connection interruptions for in-flight tool calls.
* **Graceful Shutdown:** During process shutdown (`SIGINT`/`SIGTERM`) or test execution cleanup, `closeAllCachedClients` is called to force-disconnect all active clients and clear the map.

## Security Hardening

The MCP server has been hardened with the following security mechanisms:

- **Strict Scope Normalization**: Enforces OAuth scopes check, mapping requested scopes to the allowlist, and enforcing that `mcp:tools:execute` implies `mcp:tools:read`.
- **Atomic Single-Use Authorization Codes**: Persisted via the `mcp_oauth_authorization_codes` Supabase table and atomically updated upon exchange to prevent replay attacks.
- **Enforced S256 PKCE**: Demands `code_challenge_method=S256` for client consent and code verification.
- **Graceful Lifecycle Shutdown**: Listens to SIGINT/SIGTERM, closing HTTP intake, ending active MCP sessions, stopping Supabase invalidation subscriptions, and clearing cached downstream client instances.
- **Fail-Fast Redacted Configuration**: Validates environment variables on boot and redacts secret values from error messages.
- **Redacting Structured JSON Logger**: Automatically filters sensitive keys (passwords, credentials, tokens) from structured logs.

## Core features

- MCP Assistant access for clients that do not want to host their own server
- Remote MCP server aggregation after connection in MCP Assistant
- Meta-tools for dynamic discovery and schema lookup
- CodeMode sandbox for safe programmatic tool orchestration
- OAuth-backed access control
- Scope-based tool visibility
- Supabase-backed auth and usage tracking
- Optional Redis fallback for OAuth client registry storage
- JSON health endpoint for monitoring

## Runtime dependencies

Required:

- Supabase URL
- Supabase service role key
- OAuth code secret
- OAuth access token secret

Optional:

- Redis URL, only if you want Redis as a fallback for OAuth client registry storage

## Environment variables

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
MCP_OAUTH_CODE_SECRET=replace-with-a-long-random-secret
MCP_OAUTH_ACCESS_TOKEN_SECRET=replace-with-a-long-random-secret
REDIS_URL=redis://localhost:6379/0
MCP_OAUTH_ISSUER=http://localhost:3002
MCP_WEB_APP_URL=http://localhost:3000
MCP_RESOURCE_URL=http://localhost:3002/mcp
MCP_RESOURCE_DOC_URL=http://localhost:3002/.well-known/oauth-protected-resource
PORT=3002
NODE_ENV=development
LOG_LEVEL=info
```

## Local development

```bash
npm install
cp .env.example .env
npm run dev
```

The server listens on `http://localhost:3002` by default.

## Docker

```bash
docker compose up --build
```

The compose file starts only the MCP server container.

## Railway deployment

Railway uses the `Dockerfile` in this folder and `railway.toml`.
The health check path is `/healthz`.

## Endpoints

- `GET /healthz` - health check
- `GET /.well-known/oauth-authorization-server` - OAuth authorization server metadata
- `GET /.well-known/oauth-protected-resource` - protected resource metadata
- `GET /oauth/*` - OAuth flow routes
- `POST /mcp` - MCP HTTP endpoint

## Health response

`GET /healthz` returns:

```json
{
  "status": "ok",
  "version": "1.0.0",
  "uptime_seconds": 123
}
```

## Notes

- `docker-compose.yml` is local-only and intentionally minimal.
- `database.sql` is retained for Supabase schema/bootstrap reference.
- Redis and Postgres are not started by the compose file.
