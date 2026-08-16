---
name: mcp-cli
description: Use when running, automating, or integrating the MCP CLI (`mcpa` / `mcp-ts`). Covers local and remote MCP tool discovery, schema inspection, direct tool execution, running local MCP gateway daemons with WebSocket bridges, authenticating via OAuth, benchmarking tool router strategies, and generating TypeScript wrappers.
---

# MCP CLI (`mcpa` / `mcp-ts`) Agent Skill

Use this skill when interacting with the **`@mcp-ts/cli`** toolchain (`mcpa` or `mcp-ts`). It provides complete guidance for discovering, inspecting, executing, bridging, and benchmarking Model Context Protocol (MCP) tools across both local and remote environments.

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
| **`mcpa serve`** | `mcpa serve [--port 8765] [--mode <search\|all>]` | Start the unified local MCP HTTP gateway + connect the remote WebSocket bridge. |
| **`mcpa login`** | `mcpa login [--remote <url>]` | Authenticate with MCP Assistant via browser OAuth (PKCE) and store the session locally. |
| **`mcpa logout`** | `mcpa logout [--remote <url>]` | Revoke active CLI OAuth session and clear credentials. |
| **`mcpa init`** | `mcpa init [--dir <path>]` | Generate a default `.mcpassistant/mcp.json` configuration. |
| **`mcpa connect`** | `mcpa connect <url>` | Open an interactive REPL (`search`, `schema`, `call`) connected to a remote MCP server. |
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

### Workflow B: Running the Unified Local MCP Gateway (`mcpa serve`)

Use `mcpa serve` to expose a local HTTP MCP endpoint (`http://127.0.0.1:8765/mcp`) for IDEs, Claude Desktop, Cursor, Antigravity, OpenCode, or custom agents.

```bash
# Start in Progressive Search Mode (recommended to avoid LLM context bloat)
mcpa serve --mode search

# Start in Flat / Direct Tools Mode
mcpa serve --mode all --port 8765
```

**How Progressive Discovery Mode works:**
- Instead of exposing hundreds of tool schemas at once, the gateway exposes dynamic meta-tools:
  - `search_tools(query, limit)`
  - `get_tool_schema(tool_name)`
  - `execute_tool(tool_name, arguments)`
- This reduces prompt token overhead by up to 90%.

---

### Workflow C: Remote Server Discovery & Remote Bridge

When accessing remote servers hosted on MCP Assistant (`https://api.mcp-assistant.in`):

1. **Ensure Authentication**:
   ```bash
   # Check or log in
   mcpa login --remote https://api.mcp-assistant.in
   ```
2. **Search Remote Tools**:
   ```bash
   mcpa search https://api.mcp-assistant.in/mcp "github create pull request"
   ```
3. **Explore via Interactive REPL**:
   ```bash
   mcpa connect https://api.mcp-assistant.in/mcp
   ```
   *REPL Commands:*
   - `search <query>` — Find remote tools
   - `schema <tool>` — View JSON schema
   - `call <tool> <jsonArgs>` — Invoke the remote tool
   - `help` / `exit`

4. **Bridge Local & Remote Tools Together**:
   When `mcpa serve` runs on an authenticated machine, it automatically initiates a WebSocket bridge (`wss://api.mcp-assistant.in/bridge/connect`).
   - Local tools in `mcp.json` become callable remotely.
   - Remote tools (GitHub, Notion, Exa, Supabase, Zapier) become callable locally through `http://127.0.0.1:8765/mcp`.

---

### Workflow D: Code Generation & Benchmarking

When writing integration code or optimizing token budgets for agents:

```bash
# Compare token usage between 'all', 'search', and 'groups' strategies:
mcpa bench https://api.mcp-assistant.in/mcp

# Generate typed TypeScript client bindings:
mcpa codegen https://api.mcp-assistant.in/mcp --out ./src/mcp-generated.ts
```

---

## 4. Configuration File Structure (`mcp.json`)

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

## 5. Authentication & Storage Paths

CLI OAuth tokens and session data are stored locally:

| OS | Config / Token Directory |
| :--- | :--- |
| **Windows** | `%LOCALAPPDATA%\mcp-assistant\` (`auth.json`, `mcp-sessions.json`) |
| **macOS** | `~/Library/Application Support/mcp-assistant/` |
| **Linux** | `~/.config/mcp-assistant/` (or `$XDG_CONFIG_HOME/mcp-assistant`) |

Environment variable overrides:
- `MCPA_CONFIG_DIR` — Custom configuration and token directory
- `REMOTE_GATEWAY_URL` — Custom remote gateway URL (default: `https://api.mcp-assistant.in`)
- `MCP_CONFIG_PATH` — Path to explicit `mcp.json` file

---

## 6. Common Errors & Troubleshooting

- **`InvalidAuthSessionError` / `Not signed in`**:
  Run `mcpa login` or re-authenticate.
- **Port Conflict on `8765`**:
  Run with `--port <port>`, e.g., `mcpa serve --port 8780`.
- **Tool name collision**:
  When tools share names across servers, reference them using composite IDs: `<serverId>::<toolName>` (e.g. `github::create_issue` or `local:filesystem::read_file`).
