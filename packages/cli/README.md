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

The CLI currently connects to Streamable HTTP endpoints that do not require an interactive OAuth flow.
