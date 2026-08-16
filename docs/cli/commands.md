---
title: "CLI Commands"
sidebarTitle: "Commands"
description: "Complete command reference for the @mcp-ts/cli (mcpa / mcp-ts), including call, search, schema, list, serve, login, logout, init, connect, bench, and codegen."
icon: "list-check"
---

The CLI supports both **`mcpa`** and **`mcp-ts`** executable names.

```bash
mcpa <command> [options]
# or
mcp-ts <command> [options]
```

---

## Global Flags

| Flag | Description |
| :--- | :--- |
| `-v`, `--version` | Display the installed CLI version. |
| `-h`, `--help` | Show usage instructions and available commands. |
| `--verbose` | Output verbose logs, including child server `stderr` output. |

---

## Commands

### `serve`
Run the local MCP gateway daemon. Starts local MCP servers defined in `mcp.json`, exposes a local HTTP endpoint (`http://127.0.0.1:8790/mcp`), and optionally bridges outbound to the remote gateway.

```bash
mcpa serve [options]
```

#### Options:
- `--mode <all|search>`: Tool exposure strategy for connected IDE agents (default: `search`).
  - `search`: Exposes `list_mcp_servers`, `search_mcp_tools`, `get_mcp_tool_schema`, and `call_mcp_tool` to minimize LLM context bloat.
  - `all`: Exposes all raw tool schemas directly.
- `--host <host>`: Local host interface (default: `127.0.0.1`).
- `--port <port>`: Local port number (default: `8790`).
- `--path <path>`: Local HTTP route path (default: `/mcp`).
- `--remote <url>`: Remote gateway URL (default: `https://api.mcp-assistant.in`).
- `--verbose`: Stream all child process startup stderr logs.

---

### `call`
Execute a local MCP tool directly from the terminal without keeping a daemon running. Ideal for shell-based coding agents (Claude Code, Antigravity, OpenCode, Aider) or CI scripts.

```bash
mcpa call <tool> [jsonArgs]
```

```bash
# Read a file via local filesystem MCP server
mcpa call filesystem:read_file '{"path":"package.json"}'

# List repository issues
mcpa call github:list_issues '{"repo":"zonlabs/mcp-ts"}'
```

---

### `search`
Search across local or remote tool catalogs using BM25 token ranking.

```bash
# Search local tools from mcp.json
mcpa search "create pull request"

# Search a remote MCP server catalog
mcpa search https://api.mcp-assistant.in/mcp "send email" --limit 5
```

---

### `schema`
Inspect the full JSON input and output schemas for a specific tool.

```bash
mcpa schema filesystem:read_file
```

---

### `list` / `servers`
List all configured local MCP servers and their available tools.

```bash
mcpa list
```

---

### `login`
Sign in to a remote MCP Assistant origin using browser Authorization Code + PKCE. Credentials are stored in the platform user-config directory, separately from project configuration.

```bash
mcpa login [options]
```

#### Options:
- `--remote <url>`: Remote origin (default: `https://api.mcp-assistant.in`).

### `logout`
Revoke the saved CLI session, disconnect its active bridge, and remove local credentials.

```bash
mcpa logout [--remote <url>]
```

---

### `init`
Create a default `mcp.json` configuration file in the specified or current directory.

```bash
mcpa init [--dir <path>]
```

---

### `connect`
Open an interactive REPL shell to explore a remote Streamable HTTP / SSE MCP server.

```bash
mcpa connect <url>
```

#### REPL Subcommands:
- `search <query>`: Run semantic/BM25 tool search on the connected catalog.
- `schema <tool>`: Print the full JSON input and output schemas for a tool.
- `call <tool> <json>`: Execute a tool call with a JSON argument payload.
- `help`: Display REPL help commands.
- `exit` / `quit`: Disconnect and exit REPL.

---

### `bench`
Compare tool-router strategies (`all`, `search`, `groups`) against a remote tool catalog and calculate estimated LLM context token usage.

```bash
mcpa bench <url>
```

---

### `codegen`
Generate type-safe, dependency-free TypeScript client wrappers from a server's tool schemas.

```bash
mcpa codegen <url> --out <file>
```

```bash
mcpa codegen https://api.example.com/mcp --out ./src/generated-tools.ts
```
