# LinkOS Skills

This directory contains installable agent skills for LinkOS.

## Available Skills

- [`linkos`](linkos/SKILL.md) - Use connected MCP servers through dynamic tool discovery, schema inspection, and sandboxed execution.
- [`mcp-cli`](mcp-cli/SKILL.md) - Explore, search, benchmark, codegen, execute tools directly, and run the local MCP gateway with the MCP CLI (`mcpa`).

## Install

```sh
npx skills add zonlabs/mcp-ts --skill linkos
npx skills add zonlabs/mcp-ts --skill mcp-cli
```
