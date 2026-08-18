# @mcp-ts/cli (`mcpa` | `mcp-ts`)

Bridge local and remote MCP servers for any MCP client (Cursor, VS Code, Windsurf, Claude Code, ChatGPT, OpenCode, Antigravity, and more). Explore, search, benchmark, codegen, execute tools directly, and run a local MCP gateway.

## Installation & Quick Aliases

Run directly with `npx` or install globally:

```bash
# Global install (provides both `mcpa` and `mcp-ts` commands)
npm install -g @mcp-ts/cli

# Or run via npx
npx @mcp-ts/cli [command]
```

Both **`mcpa`** (fast 4-letter alias) and **`mcp-ts`** work identically.

---

## ⚡ Direct Tool Execution & Local Discovery (For Terminal Agents)

Run one-shot tool calls or discover local tools directly without starting a daemon:

```bash
# List all configured local MCP servers and tools
mcpa list

# Search tools in local mcp.json using in-memory BM25 index
mcpa search "create pull request"

# Inspect tool JSON schemas (single or multiple)
mcpa schema filesystem:read_file filesystem:write_file

# Directly execute a tool call (JSON or key=value shorthand)
mcpa call filesystem:read_file '{"path":"package.json"}'
mcpa call exa::web_search_exa query="latest AI news"
mcpa call github::list_issues repo="zonlabs/mcp-ts",state="open"
```

### 🤖 Agent Script Automation & Multi-Tool Chaining

Agents and automation scripts can execute `mcpa` programmatically to chain tools across services, execute batch tasks in parallel, or safely pass large multiline Markdown payloads without shell quote escaping issues:

```javascript
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const execFileAsync = promisify(execFile);

async function mcpaCall(tool, args = {}) {
  const { stdout } = await execFileAsync("mcpa", ["call", tool, JSON.stringify(args)]);
  return JSON.parse(stdout);
}

// 1. Chaining tools (Web Search -> Synthesize -> Create GitHub Issue / PR)
const results = await mcpaCall("exa::web_search_exa", { query: "MCP spec updates 2026" });
await mcpaCall("github::create_issue", {
  owner: "zonlabs",
  repo: "mcp-ts",
  title: "MCP Spec Review",
  body: `## Research Findings\n- Discovered ${results.length} relevant updates.`,
});

// 2. Parallel execution across multiple connected services
const [issues, docs] = await Promise.all([
  mcpaCall("github::list_issues", { repo: "zonlabs/mcp-ts", state: "open" }),
  mcpaCall("notion::query_database", { database_id: "projects-db" }),
]);
```

---

## 🔌 Run a Local MCP Gateway (For Code IDEs & Remote Bridges)

Expose your local MCP servers to Code IDEs (Cursor, VS Code, Windsurf) through a clean HTTP endpoint (`http://127.0.0.1:8765/mcp`) with **Progressive Tool Discovery** to prevent prompt context bloat:

```bash
mcpa init                                  # write a default mcp.json
mcpa serve                                 # run interactive local gateway with live traffic logs
mcpa serve -d                              # run as a detached background daemon
mcpa daemon start                          # start background daemon (survives closed terminals)
mcpa daemon status                         # inspect daemon PID, uptime, port, and health
mcpa daemon logs                           # view recent daemon logs
mcpa daemon stop                           # stop running background daemon
```

### 🔄 Automatic Hot-Reloading (#191)
The gateway actively watches `mcp.json`. Whenever servers are connected, removed, enabled, or disabled (`mcpa connect`, `mcpa enable/disable`, or direct edits), the gateway dynamically updates routes and search indexes with **zero downtime**.

In `.cursor/mcp.json` or VS Code MCP settings:
```json
{
  "mcpServers": {
    "local-gateway": {
      "url": "http://127.0.0.1:8765/mcp"
    }
  }
}
```

---

## 🌐 Remote Bridge Connection

Sign in to the remote gateway and bridge local servers through the account's single active gateway session. Point remote MCP clients at `https://api.mcp-assistant.in/mcp`; local coding agents can continue using the local HTTP endpoint.

```bash
mcpa login --remote https://api.mcp-assistant.in  # browser OAuth + PKCE
mcpa serve                                        # local HTTP gateway + remote bridge
mcpa logout                                       # revoke this CLI session
```

---

## 🔎 Explore a Remote Server

```bash
mcpa connect https://api.example.com/mcp
mcpa search https://api.example.com/mcp "send email"
mcpa bench https://api.example.com/mcp
mcpa codegen https://api.example.com/mcp --out ./src/mcp-tools.ts
```

The interactive `connect` command supports `search`, `schema`, and `call` commands. `search` uses the SDK's BM25-backed `ToolRouter`; `bench` compares the estimated context cost of its `all`, `search`, and `groups` exposure strategies. `codegen` produces dependency-free TypeScript wrappers from the server's JSON schemas.
