# @mcp-ts/remote-gateway

Cloudflare Worker MCP gateway. Exposes a single clean MCP endpoint
(`https://linkos.in/mcp`) that any MCP client (ChatGPT, Claude, Claude Desktop)
can connect to with OAuth 2.1. Each user's local machines run
`@mcp-ts/local-gateway` and hold a persistent outbound WebSocket to this
worker; remote tool calls are relayed over that connection to the correct
local server.

## Architecture

```
MCP client ──OAuth 2.1──> https://linkos.in/mcp   (stateless createMcpHandler)
                                   │  tools/call
                                   ▼
                         DeviceConnection Durable Object
                         (holds live WS per device)
                                   ▲ outbound WebSocket
                                   │
                         local machine: @mcp-ts/local-gateway
```

- **Auth**: spec-compliant OAuth 2.1 via `@cloudflare/workers-oauth-provider`
  (RFC 7591 dynamic client registration, RFC 8414 metadata, KV-backed encrypted
  tokens). The `/authorize` endpoint redirects the browser to the login app
  (`mcp-client`, default `https://mcp-assistant.in`); after the user signs in
  with their Supabase account, the login app bounces back with the Supabase
  session token and the gateway completes authorization.
- **Identity**: every grant is bound to the Supabase `userId` (`user:<id>` →
  devices in the `USERS` KV). A grant can optionally carry a `deviceId`
  (`device:<id>` → `{userId, servers}`) for device-bound credentials used by
  `mcp-gateway link`.
- **Routing**: token → grant `props` (userId + optional deviceId) → user's
  devices (all devices, or the single bound device) → each device's Durable
  Object → the live WebSocket → the local gateway.
- **Tools**: aggregated flat at `/mcp` across all of the user's devices;
  collisions prefixed with the server name (then device).

## Env bindings (wrangler.jsonc)

| Binding | Type | Purpose |
|---|---|---|
| `OAUTH_KV` | KV namespace | OAuth provider storage (required) |
| `USERS` | KV namespace | `user:<id>` → device list, `device:<id>` → record |
| `DEVICE_CONNECTION` | Durable Object | holds each device's WebSocket |
| `SUPABASE_URL` | var | Supabase project URL (used to validate sessions) |
| `SUPABASE_ANON_KEY` | var | Supabase anon key (used to validate sessions) |
| `LOGIN_BASE_URL` | var | login app origin, default `https://mcp-assistant.in` |
| `PUBLIC_MCP_URL` | var | e.g. `https://linkos.in/mcp` |

## Local development

```bash
npm install
npx wrangler dev --local --port 8788
```

> Without real `SUPABASE_URL`/`SUPABASE_ANON_KEY` (or while they still contain
> the `REPLACE_WITH_` placeholders) the gateway falls back to a dev identity:
> `userId = user_<sha256(token).slice(0,20)>`. This lets the full OAuth flow run
> locally without a Supabase project.

Then pair a local gateway (see `@mcp-ts/local-gateway`) and run the OAuth flow.

## Deploy

Replace the placeholder KV namespace IDs and Supabase values, then:

```bash
npx wrangler deploy
```

Add the custom domain route for production:

```bash
npx wrangler deploy --route "linkos.in/*"
```

> Note: do **not** put a `routes` array in `wrangler.jsonc` when running
> `wrangler dev` — it rewrites the request Host to the custom domain and breaks
> OAuth audience matching locally. Configure routes at deploy time instead.

## Endpoints

| Path | Purpose |
|---|---|
| `POST /mcp` | MCP Streamable HTTP endpoint (OAuth-protected) |
| `GET /authorize` | OAuth 2.1 authorization — redirects to the login app sign-in |
| `POST /oauth/token`, `/oauth/register` | provider-owned token / DCR endpoints |
| `GET /connect` | WebSocket upgrade for local gateways (user-bound OAuth token) |
| `GET /healthz` | health check |

