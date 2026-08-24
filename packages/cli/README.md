# @mcp-ts/cli (`mcpa` | `mcp-ts`)

Bridge local and remote MCP servers for any MCP client (Cursor, VS Code, Windsurf, Claude Code, ChatGPT, OpenCode, Antigravity, and more). Explore, search, benchmark, generate wrappers, call tools, and run a local MCP gateway.

> [!TIP]
> Refer to the [**`mcp-cli` skill**](../../skills/mcp-cli/SKILL.md) or install it with:
> ```bash
> npx skills add zonlabs/mcp-ts --skill mcp-cli
> ```

## Installation

```bash
# Global install (provides both commands)
npm install -g @mcp-ts/cli

# Or run without a global install
npx @mcp-ts/cli [command]
```

`mcpa` and `mcp-ts` are equivalent aliases. This release documents CLI 0.3.0.

## One gateway, two lifecycles

The CLI has one gateway implementation. Choose foreground or background operation only by the lifecycle you need:

```text
mcpa serve          # foreground gateway with live logs
mcpa daemon start   # the same gateway in the background
mcpa list           # reuse either gateway, or start the managed daemon
```

Normal `list`, `search`, `schema`, and `call` commands connect to this gateway. They reuse a healthy managed daemon or foreground gateway; when status is `stopped`, they auto-start the managed daemon. They never create a direct remote HTTP command path or a one-shot bridge, and a failure never switches transports.

`mcpa daemon status` reports the lifecycle state:

| State | Command behavior |
|---|---|
| `running` | Reuse the managed daemon. |
| `external` | Reuse the healthy foreground gateway without adopting it. |
| `stopped` | A normal command starts the managed daemon automatically. |
| `starting` | Wait for startup and check again. |
| `occupied` | Report a hard port-owner diagnostic; do not kill or adopt the owner. |
| `unhealthy` | Report a hard health/log diagnostic; do not replace the process automatically. |

`mcpa daemon stop` stops only a recorded managed daemon. It cannot stop a foreground gateway or an unknown process that owns the port.

## Discover and call tools

```bash
# Inspect the catalog
mcpa list
mcpa list --tools

# Search the gateway's catalog
mcpa search "create pull request" --limit 10

# Inspect and call with canonical serverId::toolName IDs
mcpa schema filesystem::read_file github::list_issues
mcpa call filesystem::read_file '{"path":"package.json"}'
mcpa call exa::web_search_exa query="latest AI news"
mcpa call github::list_issues repo="zonlabs/mcp-ts",state="open"
mcpa call filesystem::read_file '{"path":"package.json"}' --json
```

For automation, pass arguments without a shell, serialize complex payloads with `JSON.stringify`, and add `--json`. In that mode stdout is exactly one JSON document; banners, progress, and warnings go to stderr or are suppressed. The [`mcp-cli` skill](../../skills/mcp-cli/SKILL.md#batch-multiple-tool-calls) contains a safe Node `execFile` batch example. Its batch input uses `server|tool`, while the canonical tool ID passed to the CLI uses `server::tool`.

## Gateway operations

```bash
mcpa init                    # write a default mcp.json
mcpa serve                   # foreground gateway with live logs
mcpa daemon start            # background managed gateway
mcpa daemon status           # state, PID/owner, port, and health
mcpa daemon logs             # managed gateway logs
mcpa daemon stop             # stop only the managed daemon
```

The gateway watches `mcp.json`. Connecting, removing, enabling, disabling, or editing configured servers updates routes and search indexes without replacing the gateway.

Point local MCP clients at the gateway:

```json
{
  "mcpServers": {
    "local-gateway": {
      "url": "http://127.0.0.1:8765/mcp"
    }
  }
}
```

## Authentication and remote servers

Sign in before expecting authenticated remote tools in the gateway catalog:

```bash
mcpa login --remote https://api.mcp-assistant.in
mcpa list --tools
mcpa search "send email"
mcpa logout
```

Missing or expired authentication is a catalog/auth problem, not a gateway lifecycle problem. A successful `mcpa login` activates the existing local-only gateway's remote bridge in place, without changing its PID or port. Authenticate and retry the normal command; do not restart the gateway or fall back to direct authenticated HTTP.

Add a remote MCP server to the gateway configuration, then use the same normal commands:

```bash
mcpa connect exa https://mcp.exa.ai/mcp
mcpa list exa --tools
mcpa search "web search"
```

The interactive `connect` command supports discovery and configuration. `search` uses the SDK's BM25-backed `ToolRouter`; successful results remain available alongside explicit per-server timeout or connection diagnostics.

## Troubleshooting

- **CLI is missing or older than 0.3.0:** install or upgrade with user approval, then repeat the version and status preflight. Do not use earlier behavior as a fallback.
- **Remote servers are missing:** run `mcpa login`, then repeat `mcpa list --tools`. Restarting the gateway does not repair authentication.
- **Status is `occupied`:** inspect the reported port owner. The CLI will not kill or adopt it, and normal commands will not switch transports.
- **Status is `unhealthy`:** inspect the reported log and health data. The CLI will not replace it automatically.
- **A detailed list is partial:** keep successful server results and inspect each explicit diagnostic. Missing tool names are never fabricated.
- **A tool name is ambiguous:** use the canonical `serverId::toolName` ID shown by list or search.
