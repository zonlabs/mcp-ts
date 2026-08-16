# @mcp-ts/cli

Bridge local and remote MCP servers for any MCP client (ChatGPT, Claude Desktop, opencode, and more). Explore, search, benchmark, codegen, and run a local MCP gateway.

## Explore a remote server

```bash
npx @mcp-ts/cli connect https://api.example.com/mcp
npx @mcp-ts/cli search https://api.example.com/mcp "send email"
npx @mcp-ts/cli bench https://api.example.com/mcp
npx @mcp-ts/cli codegen https://api.example.com/mcp --out ./src/mcp-tools.ts
```

The interactive `connect` command supports `search`, `schema`, and `call` commands. `search` uses the SDK's BM25-backed `ToolRouter`; `bench` compares the estimated context cost of its `all`, `search`, and `groups` exposure strategies. `codegen` produces dependency-free TypeScript wrappers from the server's JSON schemas.

## Run a local MCP gateway

Expose your local MCP servers to remote clients through `mcp-ts serve`, and connect your local and remote servers so they can be used together from any MCP client.

```bash
npx @mcp-ts/cli init                                  # write a default mcp.json
npx @mcp-ts/cli serve                                 # run the local gateway daemon
```

## Remote connection

Pair your machine with the remote gateway and bridge your local servers to it. Point any MCP client (ChatGPT, Claude Desktop, opencode) at the gateway's `/mcp` endpoint and your local tools become callable from anywhere.

```bash
npx @mcp-ts/cli link   # explicit one-time pairing (OAuth sign-in)
npx @mcp-ts/cli serve  # bridge local servers to the remote gateway (it'll start oauth automatically if not linked already using npx @mcp-ts/cli link)
```

`link` performs an OAuth login, generates a device identity, and saves a token. `serve` opens a persistent WebSocket bridge to the remote gateway, registers your local MCP servers, and relays tool calls to them, with automatic reconnection. To use a different gateway, pass `--remote <url>` (or run `serve --local` for local-only).
