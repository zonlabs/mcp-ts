---
title: "CLI Commands"
sidebarTitle: "Commands"
description: "Complete command reference for the @mcp-ts/cli (mcpa / mcp-ts), including serve, link, init, connect, search, bench, and codegen."
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
Run the local MCP gateway daemon. Starts local MCP servers defined in `mcp.json`, exposes a local HTTP endpoint, and bridges outbound to the remote gateway.

```bash
mcpa serve [options]
```

#### Options:
- `--host <host>`: Local host interface (default: `0.0.0.0`).
- `--port <port>`: Local port number (default: `8787`).
- `--path <path>`: Local HTTP route path (default: `/mcp`).
- `--remote <url>`: Remote gateway URL (default: `https://api.mcp-assistant.in`).
- `--device-id <id>`: Override device identity identifier.
- `--token <token>`: Override authentication token.
- `--verbose`: Stream all child process startup stderr logs.

---

### `link`
Pair this machine with your remote MCP Assistant account. Opens an interactive browser OAuth flow and saves device credentials to `.mcpassistant/auth.json`.

```bash
mcpa link [options]
```

#### Options:
- `--remote <url>`: Gateway URL to pair with (default: `https://api.mcp-assistant.in`).
- `--dir <path>`: Working directory to read/save configuration.
- `--login <url>`: Custom login worker base URL.

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

### `search`
Search a remote tool catalog directly from your terminal using BM25 token routing.

```bash
mcpa search <url> <query> [--limit <count>]
```

```bash
mcpa search https://api.mcp-assistant.in/mcp "send slack message" --limit 5
```

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
