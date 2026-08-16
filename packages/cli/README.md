# @mcp-ts/cli (`mcpa` / `mcp-ts`)

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

# Directly execute a tool call
mcpa call filesystem:read_file '{"path":"package.json"}'
mcpa call github:list_issues '{"repo":"zonlabs/mcp-ts"}'
```

---

## 🔌 Run a Local MCP Gateway (For Code IDEs & Remote Bridges)

Expose your local MCP servers to Code IDEs (Cursor, VS Code, Windsurf) through a clean HTTP endpoint (`http://127.0.0.1:8765/mcp`) with **Progressive Tool Discovery** to prevent prompt context bloat:

```bash
mcpa init                                  # write a default mcp.json
mcpa serve                                 # run local gateway daemon with search discovery
mcpa serve --mode search                   # force progressive search meta-tools mode
mcpa serve --mode all                      # direct flat tools mode
```

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
