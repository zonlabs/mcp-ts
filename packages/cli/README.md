# @mcp-ts/cli (`mcpa` / `mcp-ts`)

Bridge local and remote MCP servers for any MCP client (ChatGPT, Claude Desktop, opencode, and more). Explore, search, benchmark, codegen, and run a local MCP gateway.

## Installation & Quick Aliases

Run directly with `npx` or install globally:

```bash
# Global install (provides both `mcpa` and `mcp-ts` commands)
npm install -g @mcp-ts/cli

# Or run via npx
npx @mcp-ts/cli [command]
```

Both **`mcpa`** (fast 4-letter alias) and **`mcp-ts`** work identically.

## Explore a remote server

```bash
mcpa connect https://api.example.com/mcp
mcpa search https://api.example.com/mcp "send email"
mcpa bench https://api.example.com/mcp
mcpa codegen https://api.example.com/mcp --out ./src/mcp-tools.ts
```

The interactive `connect` command supports `search`, `schema`, and `call` commands. `search` uses the SDK's BM25-backed `ToolRouter`; `bench` compares the estimated context cost of its `all`, `search`, and `groups` exposure strategies. `codegen` produces dependency-free TypeScript wrappers from the server's JSON schemas.

## Run a local MCP gateway

Expose your local MCP servers to remote clients through `mcpa serve`, and connect your local and remote servers so they can be used together from any MCP client.

```bash
mcpa init                                  # write a default mcp.json
mcpa serve                                 # run the local gateway daemon
```

## Remote connection

Pair your machine with the remote gateway and bridge your local servers to it. Point any MCP client (ChatGPT, Claude Desktop, opencode) at the gateway's `/mcp` endpoint and your local tools become callable from anywhere.

```bash
mcpa link   # explicit one-time pairing (OAuth sign-in)
mcpa serve  # bridge local servers to the remote gateway (initiates OAuth if not already linked)
```

`link` performs an OAuth login, generates a device identity, and saves a token. `serve` opens a persistent WebSocket bridge to the remote gateway, registers your local MCP servers, and relays tool calls to them, with automatic reconnection. To use a different gateway, pass `--remote <url>`. Add `--verbose` for full child process stderr output.
