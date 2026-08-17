# MCP Server

The `mcp-server` service runs MCP Assistant's standalone HTTP MCP service, connecting AI clients to MCP tools and remote app integrations through the Model Context Protocol. Use it when you want an MCP client to access MCP Assistant without hosting your own server.

After connecting remote MCP servers in [mcp-assistant.in](https://mcp-assistant.in/), it provides access to 100+ MCP servers (GitHub, Notion, Zapier, Supabase, and more). It also exposes meta-tools for dynamic MCP discovery and a CodeMode tool that executes programs inside a secure sandbox for programmatic tool calling.

## What it does

- Serves the public MCP endpoint at `POST /mcp`
- Exposes OAuth metadata and token endpoints, validating access tokens and scopes
- Connects clients to the MCP Assistant tool network
- Provides meta-tools for MCP discovery, schema inspection, and CodeMode execution
- Tracks usage and session state through Supabase
- Provides a health endpoint for uptime and deploy checks

## Built-in tools

- **Discovery:** `list_mcp_servers`, `search_mcp_tools`, `get_mcp_tool_schema`, `call_mcp_tool`
- **Code execution:** `codemode_run`
- **Admin:** `index_mcp_server`, `delete_mcp_server`, `find_mcp_servers`

## Local gateway bridge

The gateway also serves tools from **local MCP servers** connected through `mcpa serve`, merged into the same `/mcp` discovery surface. One authenticated account has one active local gateway; a newer connection replaces the previous one.

- `GET /bridge/connect` upgrades to an authenticated JSON-RPC 2.0 WebSocket using an `Authorization: Bearer` header.
- `BridgeSession` is a hibernatable Durable Object keyed by authenticated user ID. It owns the active socket and persists the latest complete local catalog.
- Local server IDs are supplied by the CLI and remain stable across discovery and calls. Credentials never appear in bridge URLs.

## Security

- **Strict scope normalization** — maps requested scopes to the allowlist; `mcp:tools:execute` implies `mcp:tools:read`.
- **Atomic single-use authorization codes** — persisted in Supabase and atomically exchanged to prevent replay attacks.
- **Enforced S256 PKCE** — requires `code_challenge_method=S256`.
- **Graceful shutdown** — closes HTTP intake, active MCP sessions, and Supabase subscriptions on SIGINT/SIGTERM.
- **Fail-fast redacted configuration** — validates env vars on boot and redacts secrets from errors and structured logs.

## Runtime dependencies

Required: Supabase URL, Supabase service role key, OAuth code secret, OAuth access token secret.

Optional: Redis URL, only if you want Redis as a fallback for OAuth client registry storage.

## Environment variables

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
MCP_OAUTH_CODE_SECRET=replace-with-a-long-random-secret
MCP_OAUTH_ACCESS_TOKEN_SECRET=replace-with-a-long-random-secret
REDIS_URL=redis://localhost:6379/0
MCP_OAUTH_ISSUER=http://localhost:8788
MCP_WEB_APP_URL=http://localhost:3000
MCP_RESOURCE_URL=http://localhost:8788/mcp
MCP_RESOURCE_DOC_URL=http://localhost:8788/.well-known/oauth-protected-resource
NODE_ENV=development
LOG_LEVEL=info
```

## Local development

```bash
npm install
npm run dev
```

Runs the Worker locally with `wrangler dev` (default `http://localhost:8788`).

## Cloudflare Workers deployment

Deploy with `wrangler deploy` (the `mcp-assistant` worker). Health check path: `/healthz`.

## Endpoints

- `GET /healthz` — health check
- `GET /.well-known/oauth-authorization-server` — OAuth authorization server metadata
- `GET /.well-known/oauth-protected-resource` — protected resource metadata
- `GET /oauth/*` — OAuth flow routes
- `POST /mcp` — MCP HTTP endpoint

## Notes

- The Worker uses Supabase for storage (`MCP_TS_STORAGE_TYPE=supabase`).
