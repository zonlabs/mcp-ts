# @mcp-ts/local-gateway

Local MCP gateway daemon. Runs your local MCP servers (stdio or HTTP/SSE),
aggregates their tools into a single flat namespace, exposes a clean local MCP
endpoint (`http://local.mcp-assistant.in/mcp`), and bridges outbound to a remote
gateway so remote MCP clients (ChatGPT, Claude, etc.) can reach them over a
single clean URL.

Built on the official MCP TypeScript SDK v2 (`@modelcontextprotocol/client`).

## Install

```bash
npm install -g @mcp-ts/local-gateway
```

Requires Node >= 21.

## Quick start

```bash
# 1. Create a default mcp.json
mcp-gateway init

# 2. Edit .mcpassistant/mcp.json — standard mcpServers format:
#    { "mcpServers": { "filesystem": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-filesystem", "."] } } }

# 3. Pair with a remote gateway (opens browser, sign in with your account)
mcp-gateway link --remote https://api.mcp-assistant.in

# 4. Run the daemon — starts local servers, serves local endpoint, bridges to remote
mcp-gateway run
```

The remote gateway is the mcp-ts/mcp worker (`api.mcp-assistant.in/mcp`). Your
local servers' tools are flat-merged into the same `/mcp` endpoint alongside
the platform tools, so a single MCP URL exposes everything.

## CLI

| Command | Description |
|---|---|
| `mcp-gateway init [--dir <path>]` | Write a default `mcp.json` |
| `mcp-gateway link --remote <url> [--dir <path>]` | Sign in + bind this machine to your account |
| `mcp-gateway run [--host h] [--port p] [--remote url] [--device-id id] [--token tok]` | Start the daemon |

`link` registers an OAuth client, opens your browser to the remote gateway's
`/authorize`, and signs you in with your existing account on the login app
(no static registration key). The resulting user-bound device credential
(`access_token` + `refresh_token` + `clientId`) is stored in the state file and
used for the outbound WebSocket. Tokens are refreshed automatically before they
expire.

Runtime settings (host/port/path/remote/deviceId/token) are read from the state
file (`.mcpassistant/gateway-state.json`) and can be overridden by flags or env
vars (`REMOTE_GATEWAY_URL`, `DEVICE_ID`, `DEVICE_TOKEN`).

There is no interactive UI — run it as a daemon, logs go to stdout/stderr.

## mcp.json

Standard MCP server config, located via `MCP_CONFIG_PATH` or by searching
upward from the working directory for `mcp.json`.

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "."]
    },
    "remote-server": {
      "url": "https://example.com/mcp",
      "headers": { "Authorization": "Bearer xyz" }
    }
  }
}
```

- **stdio** entries use `command` + `args` (+ optional `env`, `cwd`).
- **HTTP/SSE** entries use `url` (+ optional `headers`); SSE URLs are detected
  when the path matches `/sse`.

Tools from all servers are **flat-merged**; on name collision the tool is
prefixed with its server name (`server:tool`, then `server:tool#2`, …).

## How it works

1. `ServerManager` starts each configured server via
   `StdioClientTransport` / `StreamableHTTPClientTransport` / `SSEClientTransport`
   wrapped in a v2 `Client`, and caches `tools/list`.
2. `LocalHttpServer` serves the aggregated tools over Streamable HTTP on the
   configured host:port (default `0.0.0.0:8787/mcp`) using
   `createMcpHandler` from `@modelcontextprotocol/server`.
3. `RemoteBridge` keeps a persistent outbound WebSocket to
   `<remote>/connect?deviceId=…&token=…`, registers the server catalog, and
   services `invoke` messages by dispatching to the owning local server via
   `client.callTool()` (SEP-2243 header mirroring handled by the SDK).
