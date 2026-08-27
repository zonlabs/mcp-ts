---
name: mcp-cli
description: Use when running, automating, integrating, or troubleshooting the MCP CLI (`mcpa` | `mcp-ts`), including local or remote discovery, authentication, schema inspection, tool calls, and gateway lifecycle errors.
---

# MCP CLI (`mcpa` | `mcp-ts`)

## Overview

Use this skill for every task that invokes `mcpa` or `mcp-ts`. CLI 0.3.0 has one gateway: `serve` runs it in the foreground with live logs, while `daemon start` runs the same gateway in the background.

Normal `list`, `search`, `schema`, and `call` commands always use that gateway. They reuse a healthy managed or foreground gateway and auto-start the managed daemon when the gateway is stopped.

## Remote MCP catalog

The CLI connects to the hosted gateway at `https://api.mcp-assistant.in` for authenticated access to remote MCP servers. Users manage those connections at `https://mcp-assistant.in/mcp?tab=apps`.

Servers connected or disconnected in the MCP Assistant app are synchronized automatically with the running CLI gateway and become available or unavailable in the remote catalog. Do not add app-managed remote servers to local `mcp.json`, and do not restart a healthy gateway to pick up connection changes. Use `mcpa list --tools` to inspect the current combined local and remote catalog.

## Mandatory preflight

Complete these checks before MCP work:

1. Resolve the executable and print its version.
   - PowerShell: `Get-Command mcpa,mcp-ts -ErrorAction SilentlyContinue`, then `mcpa --version`.
   - POSIX: `command -v mcpa || command -v mcp-ts`, then `mcpa --version`.
   - Pin that resolved executable or an explicit local `node .../dist/bin/mcp-ts.js` entrypoint for the whole session.
2. If neither executable exists, stop and request approval to install `@mcp-ts/cli` or download it with `npx`. Never install or download silently.
3. Require CLI version 0.3.0 or newer. If it is older, stop and request an upgrade; do not use pre-0.3.0 flags or behavior as a compatibility path.
4. Run `mcpa daemon status` and follow the state table below.
5. Run `mcpa list --tools` with the same pinned CLI. Verify the expected local and remote catalog before choosing a tool.
6. If a remote server is missing because the session is absent or expired, run `mcpa login`, then repeat `mcpa list --tools`. Authentication failures are not gateway failures; do not restart the gateway to repair auth.

| Gateway state | Required response |
|---|---|
| `running` | Reuse the managed gateway. |
| `external` | Reuse the healthy foreground gateway. Do not adopt, restart, or stop it. |
| `stopped` | Let the next normal command auto-start the managed daemon. |
| `starting` | Wait briefly, then check status again. |
| `occupied` | Stop and report the port owner diagnostic. Never kill, adopt, or restart an unknown owner. |
| `unhealthy` | Stop and inspect the reported log/health diagnostic. Never replace it automatically. |

## Gateway execution contract

```text
mcpa serve          # foreground gateway with live logs
mcpa daemon start   # the same gateway in the background
mcpa list           # reuse either gateway, or auto-start the managed daemon
```

- `list`, `search`, `schema`, and `call` do not create a direct remote HTTP path or a one-shot bridge.
- A command failure never switches transports. Diagnose the gateway, catalog, or authentication error that was reported.
- Do not invent or use `--no-daemon`, alternate transport, legacy bridge, or direct authenticated HTTP fallbacks.
- `mcpa daemon stop` stops only the recorded managed daemon. It cannot stop a foreground (`external`) gateway or an unknown port owner.
- Use canonical `serverId::toolName` IDs for schema and call operations.

## Core commands

```text
mcpa list [server] [--tools]
mcpa search "query" --limit 10
mcpa schema serverId::toolName
mcpa call serverId::toolName '{"key":"value"}' [--json]
mcpa login [--remote URL]
mcpa serve [--port 8765]
mcpa daemon <start|stop|status|logs> [--port PORT]
```

For complex arguments, invoke the pinned executable without a shell and pass `JSON.stringify(payload)` as one argument. This avoids PowerShell, cmd, and Bash quoting damage. For machine-readable calls, pass `--json`: stdout then contains exactly one JSON document, while warnings and progress use stderr or are suppressed.

## Batch multiple tool calls

For multiple calls, use a Node.js script with `execFile`. In batch input, separate the server and tool with `|`, for example `github|list_issues`. Convert that value to the canonical CLI ID `github::list_issues` before invoking `mcpa`; `|` is only the script input separator and is never sent as the tool ID.

Run independent read-only calls concurrently. Run dependent calls sequentially, and treat mutating calls as sequential unless their independence and authorization are established. Never automatically retry non-idempotent calls.

```js
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const cliEntrypoint = process.env.MCPA_CLI_JS;
if (!cliEntrypoint) throw new Error("Set MCPA_CLI_JS to the preflight-verified CLI entrypoint");

const calls = [
  { target: "filesystem|read_file", args: { path: "package.json" } },
  { target: "github|list_issues", args: { repo: "zonlabs/mcp-ts", state: "open" } },
];

function canonicalToolId(target) {
  const parts = target.split("|");
  if (parts.length !== 2 || parts.some((part) => !part || part.includes("::"))) {
    throw new Error(`Expected server|tool, received: ${target}`);
  }
  return `${parts[0]}::${parts[1]}`;
}

async function callTool({ target, args }) {
  const toolId = canonicalToolId(target);
  const { stdout } = await execFileAsync(
    process.execPath,
    [cliEntrypoint, "call", toolId, JSON.stringify(args), "--json"],
    { windowsHide: true, maxBuffer: 10 * 1024 * 1024 },
  );
  return { toolId, result: JSON.parse(stdout) };
}

const results = await Promise.allSettled(calls.map(callTool));
for (const result of results) console.log(result);
if (results.some((result) => result.status === "rejected")) process.exitCode = 1;
```

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

## Common mistakes

- **Missing remote tools:** authenticate with `mcpa login`, then repeat the catalog check. Do not start another gateway.
- **Occupied or unhealthy gateway:** stop and diagnose the reported owner or log. Do not switch transports, kill a process, or create another gateway as an automatic fallback.
- **Partial list:** keep successful server results and inspect each reported diagnostic. Never invent missing tool names.
- **Name collision:** repeat the operation with `serverId::toolName`.
- **Mixed CLI binaries:** repeat preflight and use the same verified 0.3.0+ entrypoint for every command.
