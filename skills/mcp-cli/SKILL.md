---
name: mcp-cli
description: Use when running, automating, or integrating the MCP CLI (`mcpa` / `mcp-ts`). Covers local and remote MCP discovery, schema inspection, tool calls, authentication, and safe gateway or daemon operation.
---

# MCP CLI (`mcpa` / `mcp-ts`)

Use this skill for every task that invokes or troubleshoots `mcpa` or `mcp-ts`.

## Mandatory preflight

Complete these checks before MCP work:

1. Resolve the executable and print its version.
   - PowerShell: `Get-Command mcpa,mcp-ts -ErrorAction SilentlyContinue` then `mcpa --version`.
   - POSIX: `command -v mcpa || command -v mcp-ts`, then `mcpa --version`.
   - Do not assume that skill access means the CLI is installed.
   - Pin that resolved executable or explicit local `node .../dist/bin/mcp-ts.js` invocation and reuse it for every command in the session. Never start a local build and later fall back to an unverified global `mcpa`/`mcp-ts`.
2. If neither executable exists, stop. Ask for approval to either install `npm install -g @mcp-ts/cli` or use `npx @mcp-ts/cli`. Do not install or download silently.
3. Require CLI version 0.2.2 or newer before relying on bridge-safe `list`, `search`, `schema`, or `call`. With an older version, explain that one-shot commands may replace an active remote bridge and recommend upgrading before continuing.
4. Run `mcpa daemon status`. Treat its states literally:
   - `running`: reuse the managed daemon.
   - `external`: reuse the healthy foreground gateway; do not adopt, restart, or stop it.
   - `starting`: wait briefly and check again.
   - `occupied`: report the owner PID and choose `--port`; never kill or adopt it.
   - `unhealthy`: inspect `mcpa daemon logs`; do not blindly restart.
   - `stopped`: one-shot commands still work. Start a daemon only when persistent/repeated access is useful.
5. Run `mcpa list` and verify the expected local and remote servers. If remote servers are missing, check authentication with `mcpa login` or the saved-session error first. Do not start another gateway merely to repair authentication.
6. Never kill, adopt, or restart an unknown port owner. `mcpa daemon stop` is only for a PID-managed daemon whose PID owns its recorded port.

## Choosing an execution path

- One-off work: use `mcpa list`, `mcpa search`, `mcpa schema`, and `mcpa call`. Version 0.2.2+ uses authenticated remote HTTP and does not take WebSocket bridge ownership; no daemon is required.
- Repeated work: prefer an already healthy gateway. Start `mcpa daemon start [--port <port>]` only if none exists.
- Long-running bridge: use `mcpa serve` or the daemon. MCP Assistant intentionally permits one bridge owner per account. If a foreground bridge says it was replaced, locate the other long-running gateway; do not create a reconnect loop.
- Ambiguous tool names: use canonical `serverId::toolName` IDs for schema and call operations.

## Core commands

```text
mcpa list [server] [--tools]
mcpa search "query" --limit 10
mcpa schema serverId::toolName
mcpa call serverId::toolName '{"key":"value"}'
mcpa login [--remote URL]
mcpa serve [--port 8765]
mcpa daemon <start|stop|status|logs> [--port PORT]
```

For complex arguments, invoke the executable without a shell and pass `JSON.stringify(payload)` as one argument. This avoids PowerShell, cmd, and Bash quoting damage.

## Configuration

The CLI searches upward for `.mcpassistant/mcp.json` or `mcp.json`. `MCP_CONFIG_PATH` selects a file explicitly. `REMOTE_GATEWAY_URL` selects the remote gateway. `MCPA_CONFIG_DIR` selects the auth/session/daemon state directory.

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "."]
    }
  }
}
```

## Troubleshooting

- Remote tools disappear after `mcpa list` or `mcpa search`: check `mcpa --version`. Versions before 0.2.2 can open a second WebSocket bridge and replace `mcpa serve`. Upgrade, stop the unintended long-running gateway if you own it, then restart the intended bridge once.
- Local `serve` reports replacement after a later command: compare the executable paths and versions used for both commands. Mixing a local 0.2.2+ gateway with a global pre-0.2.2 `mcpa` has the same bridge-replacement effect.
- `Not signed in` or expired session: run `mcpa login`; do not restart the daemon as an authentication fix.
- Port conflict: run `mcpa daemon status`. Reuse an `external` healthy gateway or choose another port. Never terminate an `occupied` foreign owner.
- Partial or timed-out list: keep the successful server results and inspect each reported server diagnostic. Do not invent missing tool names.
- Name collision: repeat the operation with `serverId::toolName`.
