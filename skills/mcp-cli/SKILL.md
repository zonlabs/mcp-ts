---
name: mcp-cli
description: Use when running, automating, or integrating the MCP CLI (`mcpa` / `mcp-ts`). Covers local and remote MCP tool discovery, schema inspection, direct tool execution, running local MCP gateway daemons with WebSocket bridges, authenticating via OAuth, benchmarking tool router strategies, and generating TypeScript wrappers.
---

# MCP CLI (`mcpa` | `mcp-ts`) Agent Skill

Use this skill when interacting with the **`@mcp-ts/cli`** toolchain (`mcpa` or `mcp-ts`). It provides guidance for discovering, inspecting, executing, bridging, and benchmarking Model Context Protocol (MCP) tools across both local and remote environments.

---

## 1. Quick Aliases & Installation

The CLI is available as either `mcpa` (fast 4-letter alias) or `mcp-ts`:

```bash
# Global install
npm install -g @mcp-ts/cli

# Run via npx
npx @mcp-ts/cli <command> [options]
```

---

## 2. Command Reference Cheatsheet

| Command | Usage | Purpose |
| :--- | :--- | :--- |
| **`mcpa list`** | `mcpa list [--dir <path>]` | List all local MCP servers and their exposed tools defined in `mcp.json`. |
| **`mcpa search`** | `mcpa search [url] <query> [--limit <n>]` | Search local tools (BM25) or remote server tools for capabilities matching a natural language query. |
| **`mcpa schema`** | `mcpa schema <tool1> [tool2...]` | Inspect input/output JSON schemas for one or more local/remote tools. |
| **`mcpa call`** | `mcpa call <tool> [jsonArgs]` | Directly execute an MCP tool without running a persistent daemon. |
| **`mcpa serve`** | `mcpa serve [-d] [--port 8765] [--mode <search\|all>]` | Start the unified local MCP HTTP gateway + connect the remote WebSocket bridge (`-d` for background). |
| **`mcpa daemon`** | `mcpa daemon <start\|stop\|status\|logs> [--limit <n>]` | Manage the persistent background MCP gateway daemon process. |
| **`mcpa login`** | `mcpa login [--remote <url>]` | Authenticate with MCP Assistant via browser OAuth (PKCE) and store the session locally. |
| **`mcpa logout`** | `mcpa logout [--remote <url>]` | Revoke active CLI OAuth session and clear credentials. |
| **`mcpa init`** | `mcpa init [--dir <path>]` | Generate a default `.mcpassistant/mcp.json` configuration. |
| **`mcpa connect`** | `mcpa connect --name <name> --url <url> [--auth <token>]` | Test connection to a remote/local MCP server, discover its tools, and save to `mcp.json`. |
| **`mcpa disconnect`** | `mcpa disconnect <name>` *(alias: remove, rm)* | Remove an MCP server configuration from `mcp.json`. |
| **`mcpa enable`** | `mcpa enable <name>` | Enable a disabled MCP server in `mcp.json`. |
| **`mcpa disable`** | `mcpa disable <name>` | Disable an MCP server in `mcp.json` (`"disabled": true`). |
| **`mcpa bench`** | `mcpa bench <url>` | Benchmark context token costs across exposure strategies (`all`, `search`, `groups`). |
| **`mcpa codegen`** | `mcpa codegen <url> --out <file>` | Generate strongly typed TypeScript wrapper clients directly from tool schemas. |

---

## 3. Agent Workflows & Decision Tree

### Workflow A: Direct Local Tool Execution (One-Shot)

When an agent needs to discover and call tools locally without keeping a server process open:

1. **List / Search Tools**:
   ```bash
   mcpa search "read file content"
   # or list all servers
   mcpa list
   ```
2. **Inspect Schema**:
   ```bash
   mcpa schema filesystem:read_file
   ```
3. **Execute Tool**:
   ```bash
   mcpa call filesystem:read_file '{"path": "package.json"}'
   ```

---

### Workflow B: Connecting & Registering New MCP Servers (`mcpa connect`)

When adding a new remote HTTP MCP server (with or without auth) or local stdio server:

```bash
# Connect and save a remote HTTP MCP server:
mcpa connect --name tavily --url https://mcp.tavily.com

# Connect with Bearer authentication / API Key:
mcpa connect --name custom-api --url https://api.example.com/mcp --auth "YOUR_API_TOKEN"

# Connect with custom headers:
mcpa connect --name internal-mcp --url https://mcp.internal.net --header "X-API-Key=secret123"

# Connect a local stdio command:
mcpa connect --name postgres --command npx --args "-y @modelcontextprotocol/server-postgres postgresql://localhost/mydb"
```

---

### Workflow C: Running the Unified Local MCP Gateway (`mcpa serve` & `mcpa daemon`)

Use `mcpa serve` or `mcpa daemon` to expose a local HTTP MCP endpoint (`http://127.0.0.1:8765/mcp`) for IDEs, Claude Desktop, Cursor, Antigravity, OpenCode, or custom agents.

```bash
# Foreground Interactive Server (streaming live JSON-RPC traffic):
mcpa serve --mode search

# Background Persistent Daemon (survives closed terminals & Ctrl+C):
mcpa daemon start
# or: mcpa serve -d

# Inspect & Manage Background Daemon:
mcpa daemon status
mcpa daemon logs --limit 20
mcpa daemon stop
```

**🔄 Automatic Hot-Reloading:**
- The gateway file watcher automatically monitors `mcp.json`.
- Changes made via `mcpa connect`, `mcpa enable`, `mcpa disable`, `mcpa disconnect`, or manual file edits are dynamically hot-reloaded into the running gateway with zero HTTP downtime.

**How Progressive Discovery Mode works:**
- Instead of exposing hundreds of tool schemas at once, the gateway exposes dynamic meta-tools:
  - `search_tools(query, limit)` — Search tools across local and bridged remote servers
  - `get_tool_schema(tool_name)` — Fetch input/output JSON schema for a discovered tool
  - `call_tool(tool_name, arguments)` — Proxy execution to the selected tool
- This reduces prompt token overhead by up to 90%.
- Both local stdio tools and bridged remote tools are initialized concurrently in parallel.
- CLI commands (`mcpa call`, `mcpa search`, `mcpa schema`) automatically detect a running `mcpa serve` daemon and route through it for sub-millisecond execution without re-spawning processes.

---

### Workflow D: Remote Server Discovery & Remote Bridge

When accessing remote servers hosted on MCP Assistant (`https://api.mcp-assistant.in`):

1. **Ensure Authentication**:
   ```bash
   mcpa login --remote https://api.mcp-assistant.in
   ```
2. **Search Remote Tools**:
   ```bash
   mcpa search https://api.mcp-assistant.in/mcp "github create pull request"
   ```
3. **Bridge Local & Remote Tools Together**:
   When `mcpa serve` runs on an authenticated machine, it automatically initiates a WebSocket bridge (`wss://api.mcp-assistant.in/bridge/connect`).
   - Local tools in `mcp.json` become callable remotely.
   - Remote tools (GitHub, Notion, Exa, Supabase, Zapier) become callable locally through `http://127.0.0.1:8765/mcp`.

---

### Workflow E: Code Generation & Benchmarking

When writing integration code or optimizing token budgets for agents:

```bash
# Compare token usage between 'all', 'search', and 'groups' strategies:
mcpa bench https://api.mcp-assistant.in/mcp

# Generate typed TypeScript client bindings:
mcpa codegen https://api.mcp-assistant.in/mcp --out ./src/mcp-generated.ts
```

---

## 4. Agent Script Automation & Large Payload Handling

When agents or automated scripts invoke `mcpa call` with large JSON payloads, multiline Markdown (such as pull request bodies, issue descriptions, or code snippets), passing large strings directly on the shell command line can suffer from shell quote-stripping and newline breaking (especially in PowerShell / cmd on Windows).

### Method 1: Node.js Script Automation (Recommended for Complex Payloads)
Agents can write a small scratch script and execute `mcpa` via `execFile`:

```javascript
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const payload = {
  owner: "zonlabs",
  repo: "mcp-ts",
  title: "feat: new feature",
  body: `## Summary\n- Detailed item 1\n- Detailed item 2`,
};

// Safe execution without shell quote escaping issues:
const { stdout } = await execFileAsync("mcpa", [
  "call",
  "github::create_pull_request",
  JSON.stringify(payload),
]);

console.log(JSON.parse(stdout));
```

### Method 2: Shorthand Key-Value Syntax (CLI Terminal)
For straightforward single or multiple scalar arguments, use the `key=value` syntax:
```bash
mcpa call exa::web_search_exa query="latest AI news"
mcpa call github::list_issues repo="zonlabs/mcp-ts",state="open"
```

### Method 3: Escaped JSON (PowerShell / Bash)
When typing JSON inline in PowerShell, escape inner quotes:
```powershell
mcpa call exa::web_search_exa '{\"query\": \"latest AI news\"}'
```

---

## 5. Configuration File Structure (`mcp.json`)

`mcpa` automatically searches upwards for `.mcpassistant/mcp.json` or `mcp.json` (or uses `MCP_CONFIG_PATH`).

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "."]
    },
    "custom-remote": {
      "url": "https://api.example.com/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_TOKEN"
      }
    }
  }
}
```

---

## 6. Authentication & Storage Paths

CLI OAuth tokens and session data are stored locally:

| OS | Config / Token Directory |
| :--- | :--- |
| **Windows** | `%LOCALAPPDATA%\mcp-assistant\` (`auth.json`, `mcp-sessions.json`, `daemon.pid`, `daemon.log`) |
| **macOS** | `~/Library/Application Support/mcp-assistant/` |
| **Linux** | `~/.config/mcp-assistant/` (or `$XDG_CONFIG_HOME/mcp-assistant`) |

Environment variable overrides:
- `MCPA_CONFIG_DIR` — Custom configuration and token directory
- `REMOTE_GATEWAY_URL` — Custom remote gateway URL (default: `https://api.mcp-assistant.in`)
- `MCP_CONFIG_PATH` — Path to explicit `mcp.json` file

---

## 7. Common Errors & Troubleshooting

- **`InvalidAuthSessionError` / `Not signed in`**:
  Run `mcpa login` or re-authenticate.
- **Port Conflict on `8765`**:
  Run with `--port <port>`, e.g., `mcpa serve --port 8780` or use `mcpa daemon stop` to stop any lingering background daemon.
- **Tool name collision**:
  When tools share names across servers, reference them using composite IDs: `<serverId>::<toolName>` (e.g. `github::create_issue` or `local:filesystem::read_file`).
