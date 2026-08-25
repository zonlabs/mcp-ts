---
title: "CLI Commands"
sidebarTitle: "Commands"
description: "Command reference for the @mcp-ts/cli (mcpa / mcp-ts)."
icon: "list-check"
---

The CLI supports both executable names:

```bash
mcpa <command> [options]
mcp-ts <command> [options]
```

## Global flags

| Flag | Description |
| :--- | :--- |
| `-v`, `--version` | Display the installed CLI version. |
| `-h`, `--help` | Show help for the command. |
| `--verbose` | Show detailed child-server and gateway activity logs. |

## Gateway lifecycle

### `init`

Create a starter configuration file:

```bash
mcpa init
mcpa init --dir ./my-project
```

### `serve`

Run the gateway in the foreground. It starts enabled servers from `mcp.json` and watches the file for changes. The default MCP endpoint is `http://127.0.0.1:8765/mcp`.

```bash
mcpa serve [options]
```

| Option | Description |
| :--- | :--- |
| `--mode <search\|all>` | Expose compact discovery tools (`search`, default) or every tool schema (`all`). |
| `--host <host>` | Bind host (default `127.0.0.1`). |
| `--port <port>` | Bind port (default `8765`). |
| `--path <path>` | MCP route (default `/mcp`). |
| `--remote <url>` | Remote gateway origin (default `https://api.mcp-assistant.in`). |
| `--verbose` | Show detailed server and gateway logs. |

### `daemon`

Manage the background gateway. Catalog commands start it when needed.

```bash
mcpa daemon start
mcpa daemon status
mcpa daemon logs
mcpa daemon stop
```

`daemon stop` stops a daemon started by the CLI. It does not stop another process using the gateway port.

## Catalog commands

### `list`

List configured servers and available tools:

```bash
mcpa list
mcpa list --tools
mcpa list <server> --tools
```

### `search`

Search the single gateway catalog:

```bash
mcpa search "create pull request" --limit 10
```

### `schema`

Print a tool's input and output schemas. Use canonical `server::tool` IDs:

```bash
mcpa schema filesystem::read_file
```

### `call`

Call a catalog tool. Arguments may be JSON or `key=value` pairs:

```bash
mcpa call filesystem::read_file '{"path":"package.json"}'
mcpa call github::list_issues repo="zonlabs/mcp-ts",state="open"
mcpa call filesystem::read_file '{"path":"package.json"}' --json
```

With `--json`, stdout contains one JSON document, which is useful in scripts.

## Authentication and connections

### `login`

Sign in to MCP Assistant using browser OAuth. The saved session is stored in the platform user configuration directory.

```bash
mcpa login
```

If you are already signed in, the command reports that state.

### `logout`

Disconnect the active bridge and remove the saved session:

```bash
mcpa logout
```

### `connect`

Connect to a remote MCP server. Use a configured server name or provide an endpoint URL.

```bash
mcpa connect exa https://mcp.exa.ai/mcp
mcpa connect supermemory
```

If the server needs OAuth, `connect` asks before opening a browser. Other commands show that auth is required without opening a browser.

## Utilities

### `bench`

Compare ToolRouter strategies for a remote tool catalog:

```bash
mcpa bench https://api.example.com/mcp
```

### `codegen`

Generate TypeScript wrappers from a server's tool schemas:

```bash
mcpa codegen https://api.example.com/mcp --out ./src/generated-tools.ts
```

For reproducible ToolRouter context-efficiency measurements, see the repository's [benchmark report](https://github.com/zonlabs/mcp-ts/blob/main/benchmarks/benchmark.md).
