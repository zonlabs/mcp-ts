# @mcp-ts/cli

Explore a remote MCP server without writing an application first.

```bash
npx @mcp-ts/cli connect https://api.example.com/mcp
npx @mcp-ts/cli search https://api.example.com/mcp "send email"
npx @mcp-ts/cli bench https://api.example.com/mcp
npx @mcp-ts/cli codegen https://api.example.com/mcp --out ./src/mcp-tools.ts
```

The interactive `connect` command supports `search`, `schema`, and `call` commands. `search` uses the SDK's BM25-backed `ToolRouter`; `bench` compares the estimated context cost of its `all`, `search`, and `groups` exposure strategies. `codegen` produces dependency-free TypeScript wrappers from the server's JSON schemas.

The CLI currently connects to Streamable HTTP endpoints that do not require an interactive OAuth flow.
