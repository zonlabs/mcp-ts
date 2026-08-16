---
title: "CLI & Gateway API"
sidebarTitle: "CLI Reference"
description: "Programmatic TypeScript API for @mcp-ts/cli functions and the ServerManager daemon."
icon: "terminal"
---

The `@mcp-ts/cli` package exports core modules and programmatic APIs for building custom MCP gateways and tooling.

## Installation

```bash
npm install @mcp-ts/cli
```

---

## Core API

### `createRouter(client)`
Creates a `ToolRouter` instance wrapped over an MCP client.

```typescript
import { createRouter } from "@mcp-ts/cli";
import { connectRemote } from "@mcp-ts/cli";

const client = await connectRemote("https://api.example.com/mcp");
const router = await createRouter(client);
```

### `searchTools(router, query, limit?)`
Searches tools in a catalog using BM25 token routing.

```typescript
import { searchTools } from "@mcp-ts/cli";

const matches = await searchTools(router, "send email", 5);
```

### `generateWrappers(tools)`
Produces typed TypeScript functions from tool input/output JSON schemas.

```typescript
import { generateWrappers } from "@mcp-ts/cli";

const code = generateWrappers(tools);
```

---

## Gateway API

### `ServerManager`
Manages child MCP processes (stdio) and remote HTTP/SSE connections, aggregated into a unified catalog.

```typescript
import { ServerManager } from "@mcp-ts/cli";

const manager = new ServerManager({
  filesystem: {
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-filesystem", "./data"]
  }
});

await manager.start();
const tools = manager.aggregatedTools();
```
