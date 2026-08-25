---
title: "Developer CLI Overview"
sidebarTitle: "CLI Overview"
description: "Learn how to use the @mcp-ts/cli to run a local MCP gateway, manage servers, and work with MCP tools."
icon: "terminal"
---

> For setup, automation, and troubleshooting guidance, see the [`mcp-cli` skill](https://github.com/zonlabs/mcp-ts/blob/main/skills/mcp-cli/SKILL.md).

The **@mcp-ts/cli** (`mcpa` / `mcp-ts`) is a command-line tool for working with the Model Context Protocol.

It can run the servers in `mcp.json` through a local gateway. It also has commands for finding tools, viewing schemas, calling tools, running benchmarks, and generating code.

## Install

```bash
npm install -g @mcp-ts/cli
```

Or run it without a global install:

```bash
npx @mcp-ts/cli <command>
```

`mcpa` and `mcp-ts` are two names for the same CLI. These examples use CLI `0.3.0` and later.

## Gateway model

The gateway can run in the foreground or in the background:

```bash
mcpa serve          # foreground gateway with live logs
mcpa daemon start   # the same gateway in the background
mcpa daemon status  # lifecycle, owner, port, and health
```

The `list`, `search`, `schema`, and `call` commands use a running foreground gateway or managed daemon. If no gateway is running, the CLI starts the managed daemon.

The default endpoint is `http://127.0.0.1:8765/mcp`. Configure local and remote servers in `mcp.json`; `mcpa init` creates a starter file.

## Quick start

```bash
mcpa init
mcpa serve
mcpa list --tools
mcpa search "send email" --limit 10
mcpa schema filesystem::read_file
mcpa call filesystem::read_file '{"path":"package.json"}'
```

For remote tools that need an MCP Assistant sign-in, run:

```bash
mcpa login
mcpa list --tools
```

To add a configured remote MCP server, use its name and endpoint:

```bash
mcpa connect exa https://mcp.exa.ai/mcp
```

When a remote server needs OAuth, the `connect` command asks before opening a browser. Other commands do not open a browser; they show that auth is required.

See the [command reference](/cli/commands) for flags, daemon lifecycle, JSON output, and interactive connection details.
