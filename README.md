<p align="center">
  <a href="https://github.com/zonlabs/mcp-ts">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="docs/images/logo-dark.png">
      <img src="docs/images/logo-light.png" alt="mcp toolkit" width="400">
    </picture>
  </a>
</p>

<div align="center">
  <p>Every resource is context for your AI</p>

  <p>
    <a href="https://mcp-assistant.in/">🌐 Website</a>
    &nbsp;&nbsp;|&nbsp;&nbsp;
    <a href="https://docs.mcp-assistant.in/">📚 Documentation</a>
  </p>


  <p>
    <a href="https://www.npmjs.com/package/@mcp-ts/sdk">
      <img src="https://img.shields.io/npm/v/@mcp-ts/sdk?color=dc2626&label=npm&logo=npm&style=flat-square" alt="npm version" />
    </a>
    <a href="https://pypi.org/project/mcpassistant-gateway/">
      <img src="https://img.shields.io/pypi/v/mcpassistant-gateway?color=3776ab&label=pypi&logo=pypi&style=flat-square" alt="pypi version" />
    </a>
    <a href="https://opensource.org/licenses/MIT">
      <img src="https://img.shields.io/badge/license-MIT-84cc16?style=flat-square" alt="License: MIT" />
    </a>
  </p>
</div>

<br />

## Why does `mcp-ts or toolkit` even exist?

MCP makes it possible for AI applications to talk to tools, prompts, and resources, but building applications on top of MCP quickly becomes more than calling `listTools()` and `callTool()`.

You need to manage user sessions, OAuth flows, reconnects, storage, browser updates, framework adapters, and on-demand tool discovery so agents can load and call only what they need instead of flooding the model context, similar to Claude Code's [advanced tool use](https://www.anthropic.com/engineering/advanced-tool-use).

`mcp-ts` exists to handle that application layer while keeping your MCP data in infrastructure you own or choose. See [storage backends](https://docs.mcp-assistant.in/storage-backends/overview) and [framework adapters](https://docs.mcp-assistant.in/ai-adapters/overview).

It gives you a practical foundation for building MCP-native apps:

- Have multiple users using your application
- Already using AI SDK, LangChain, Mastra, and AG-UI Protocol where handling oauth, tokens management for mcp clients seems overhead
- Reduce large model context with on-demand tool discovery through `ToolRouter`
- Render interactive MCP Apps in your application.
- Run programmatic tool calling inside a secure sandbox with `CodeMode`

In short: the official MCP SDK gives you the protocol building blocks. `mcp-ts` gives you the application layer for building MCP applications around them.

## When you may not need it ?

If you already use a managed service/platform such as Smithery, Klavis Strata, Composio, nango or a similar SDK, you may not need `mcp-ts`.

---

## 📑 Table of Contents

- [Features](#features)
- [Packages](#packages)
- [Examples](#examples)
- [Inspiration](#inspiration)
- [SDK Setup (@mcp-ts/sdk)](#sdk-setup-mcp-tssdk)
  - [Installation](#installation)
  - [Quick Start](#quick-start)
  - [MCP Endpoint (Hosted)](#-mcp-endpoint-hosted)
  - [Adapters](#-adapters)
  - [AG-UI Middleware](#-ag-ui-middleware)
  - [MCP Apps (SEP-1865)](#️-mcp-apps-sep-1865)
- [Documentation](#documentation)
  - [Topics Covered](#️-topics-covered)
- [Environment Setup](#environment-setup)
  - [Configuration Examples](#-configuration-examples)
- [Gateway Setup (mcpassistant-gateway)](#gateway-setup-mcpassistant-gateway)
  - [Installation](#installation-1)
  - [Usage](#usage)
- [Architecture](#architecture)
- [Contributing](#contributing)

---

<a id="packages"></a>

## 📦 Packages

| Package | Description | Install |
| :--- | :--- | :--- |
| **[@mcp-ts/sdk](packages/sdk)** | Core TypeScript/JavaScript SDK for client applications. | `npm i @mcp-ts/sdk` |
| **[@mcp-ts/tool-router](packages/tool-router)** | ToolRouter for dynamic tool discovery across many MCP servers. | `npm i @mcp-ts/tool-router` |
| **[@mcp-ts/codemode](packages/code-mode)** | CodeMode: sandboxed program execution for tool calling. | `npm i @mcp-ts/codemode` |
| **[mcpassistant-gateway](packages/local-gateway)** | Python bridge for local MCP support in remote apps. | `pip install mcpassistant-gateway` |

---

<a id="features"></a>

## ✨ Features

Most features are available out-of-the-box in the **TypeScript SDK**:

- **Storage Backends** - Redis, SQLite, File System, or In-Memory backends
- **Serverless** - Works in serverless environments (Vercel, AWS Lambda, etc.)
- **React Hook** - `useMcp` hook for easy React integration
- **Vue Composable** - `useMcp` composable for Vue applications
- **SSE** - Server-Sent Events for connection state and observability updates
- **MCP Protocol** - Support for tools, prompts, and resources
- **Agent Adapters** - Built-in adapters for AI SDK, LangChain, Mastra, and AG-UI
- **MCP Apps Extension (SEP-1865)** - Interactive UI-driven tool interfaces
- **ToolRouter** - Discover tools on-demand across multiple MCP servers (reduces context bloat)

<a id="examples"></a>

## 🧪 Examples

Check out working examples demonstrating the MCP Apps extension and agent integrations in the [examples/agents](examples/agents) directory.

> Examples MCP Apps referred from [modelcontextprotocol/ext-apps](https://github.com/modelcontextprotocol/ext-apps/tree/main/examples)

<div align="center">
  <table cellspacing="5" cellpadding="0">
    <tr>
      <td width="50%">
        <img src="docs/images/mcp-apps-img-1.png" alt="MCP Apps 1" width="100%" />
      </td>
      <td width="50%">
        <img src="docs/images/mcp-apps-img-2.png" alt="MCP Apps 2" width="100%" />
      </td>
    </tr>
  </table>
  <p><em>Interactive UIs for MCP tools</em></p>
</div>

<a id="inspiration"></a>

## 💡 Inspiration

> I got the idea for `@mcp-ts` while working on **[MCP Assistant](https://mcp-assistant.in)**.
As the project grew, I had a few problems: storage, using different AI frameworks like LangGraph and ADK for different use cases, and figuring out how to get progressive SSE updates at each step so I could see what was happening.
So with that idea in mind, I built this SDK to make setup easier and keep the user experience smooth.
That’s how `@mcp-ts` started.

<br/>

<div align="center">
  <img src="docs/images/mcp-assistant.png" alt="MCP Assistant" width="100%" />
</div>

<br/>

<a id="sdk-setup-mcp-tssdk"></a>

## 🛠️ SDK Setup (@mcp-ts/sdk)

### 📦 Installation

<a id="installation"></a>

```bash
npm install @mcp-ts/sdk
```

The SDK supports multiple storage backends out of the box:
- **Memory** (default, no setup required)
- **File** (local persistence)
- **SQLite** (fast local persistence, requires `npm install better-sqlite3`)
- **Redis** (production-ready, requires `npm install ioredis`)

### 🚀 Quick Start

<a id="quick-start"></a>

Working reference: [examples/next](examples/next)

<details>
<summary><strong>Server-Side (Next.js)</strong></summary>

```typescript
// app/api/mcp/route.ts
import { createNextMcpHandler } from '@mcp-ts/sdk/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const { GET, POST } = createNextMcpHandler({
  authenticate: () => {
    //  your logic here
  }
});
```

</details>

<details>
<summary><strong>Client-Side (React)</strong></summary>

```typescript
'use client';

import { useMcp } from '@mcp-ts/sdk/client/react';

function App() {
  const { connections, connect } = useMcp({
    url: '/api/mcp',
    userId: 'user-123',
  });

  return (
    <div className="flex flex-col items-center gap-4">
      <button
        onClick={() =>
          connect({
            serverId: 'my-server',
            serverName: 'My MCP Server',
            serverUrl: 'https://mcp.example.com',
            callbackUrl: `${window.location.origin}/callback`,
          })
        }
      >
        Connect
      </button>
      {connections.map((conn) => (
        <div key={conn.sessionId}>
          <h3>{conn.serverName}</h3>
          <p>State: {conn.state}</p>
          <p>Tools: {conn.tools.length}</p>
        </div>
      ))}
    </div>
  );
}
```

</details>

### 🌐 MCP Endpoint (Hosted)

<a id="-mcp-endpoint-hosted"></a>

#### Documentation MCP

- **Endpoint**: `https://docs.mcp-assistant.in/mcp`
- Use this endpoint to access `mcp-ts` / toolkit documentation over MCP.

#### MCP Assistant

- **Endpoint**: `https://api.mcp-assistant.in/mcp`
- `api.mcp-assistant.in/mcp` is the MCP Assistant server endpoint. It provides access to 100+ MCP servers such as GitHub, Notion, Zapier, and Supabase.
- The MCP Assistant server also exposes meta-tools for dynamic MCP discovery and a `CodeMode` tool that executes programs inside a secure sandbox for programmatic tool calling, workflow execution, and result processing, avoiding expensive LLM tool-calling loops.

#### Antigravity

```json
{
  "mcpServers": {
    "mcp-assistant": {
      "serverUrl": "https://api.mcp-assistant.in/mcp"
    }
  }
}
```

#### VS Code

```json
{
  "servers": {
    "mcp-assistant": {
      "type": "http",
      "url": "https://api.mcp-assistant.in/mcp"
    }
  }
}
```

### 🔌 Adapters

<a id="-adapters"></a>

Integrating with agent frameworks is simple using built-in adapters.

<details>
<summary>Vercel AI SDK</summary>

```typescript
// app/api/chat/route.ts
import { MultiSessionClient } from '@mcp-ts/sdk/server';
import { AIAdapter } from '@mcp-ts/sdk/adapters/ai';
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';

export async function POST(req: Request) {
  const { messages, userId } = await req.json();
  const client = new MultiSessionClient(userId);

  try {
    await client.connect();
    const tools = await AIAdapter.getTools(client);
    const result = streamText({
      model: openai('gpt-4'),
      messages,
      tools,
      onFinish: async () => {
        await client.disconnect();
      }
    });
    return result.toDataStreamResponse();
  } catch (error) {
    await client.disconnect();
    throw error;
  }
}
```

</details>

<details>
<summary>Agui Adapter</summary>

```typescript
import { MultiSessionClient } from '@mcp-ts/sdk/server';
import { AguiAdapter } from '@mcp-ts/sdk/adapters/agui-adapter';

const client = new MultiSessionClient("user_123");
await client.connect();

const adapter = new AguiAdapter(client);
const tools = await adapter.getTools();
```

</details>

<details>
<summary>Mastra Adapter</summary>

```typescript
import { MultiSessionClient } from '@mcp-ts/sdk/server';
import { MastraAdapter } from '@mcp-ts/sdk/adapters/mastra-adapter';

const client = new MultiSessionClient("user_123");
await client.connect();

const tools = await MastraAdapter.getTools(client);
```

</details>

### 🧩 AG-UI Middleware

<a id="-ag-ui-middleware"></a>

Execute MCP tools server-side when using remote agents (LangGraph, AutoGen, etc.):

<details>
<summary>View AG-UI (Agent Middleware)</summary>

```typescript
import { HttpAgent } from "@ag-ui/client";
import { AguiAdapter } from "@mcp-ts/sdk/adapters/agui-adapter";
import { createMcpMiddleware } from "@mcp-ts/sdk/adapters/agui-middleware";

// Connect to MCP servers
const { MultiSessionClient } = await import("@mcp-ts/sdk/server");
const client = new MultiSessionClient("user_123");
await client.connect();

// Create adapter and get tools
const adapter = new AguiAdapter(client);
const mcpTools = await adapter.getTools();

// Create agent with middleware
const agent = new HttpAgent({ url: "http://localhost:8000/agent" });
agent.use(createMcpMiddleware({
  toolPrefix: 'server-',
  tools: mcpTools,
}));
```

</details>

The middleware intercepts tool calls from remote agents, executes MCP tools server-side, and returns results back to the agent.

### 🛠️ MCP Apps (SEP-1865)

<a id="mcp-apps-sep-1865"></a>
<a id="-mcp-apps-sep-1865"></a>

Render interactive UIs for your tools using `McpAppRenderer`.

<details>
<summary>View MCP Apps</summary>

```typescript
import { useRenderToolCall } from "@copilotkit/react-core";
import { McpAppRenderer } from "@mcp-ts/sdk/client/react";
import { useMcpContext } from "./mcp";

export function ToolRenderer() {
  const { mcpClient } = useMcpContext();

  useRenderToolCall({
    name: "*",
    render: ({ name, args, result, status }) => (
      <McpAppRenderer
        client={mcpClient}
        name={name}
        input={args}
        result={result}
        status={status}
      />
    ),
  });

  return null;
}
```

</details>

<a id="documentation"></a>

## 📚 Documentation

Full documentation is available at: **[Docs](https://docs.mcp-assistant.in/)**

<a id="topics-covered"></a>
<a id="️-topics-covered"></a>

### 🗂️ Topics Covered

- **[Getting Started](https://docs.mcp-assistant.in/get-started)** - Quick setup and overview
- **[Installation](https://docs.mcp-assistant.in/install)** - Detailed installation guide
- **[Storage Backends](https://docs.mcp-assistant.in/storage-backends/overview)** - Redis, File, SQLite, Supabase, Neon, and Memory options
- **[Next.js Integration](https://docs.mcp-assistant.in/nextjs)** - Complete Next.js examples
- **[React Hook Guide](https://docs.mcp-assistant.in/react)** - Using the useMcp hook
- **[API Reference](https://docs.mcp-assistant.in/reference/server)** - Complete API documentation

<a id="environment-setup"></a>

## ⚙️ Environment Setup

The library supports multiple storage backends. You can explicitly select one using `MCP_TS_STORAGE_TYPE` or rely on automatic detection.

**Supported Types:** `redis`, `supabase`, `neon`, `sqlite`, `file`, `memory`.

<a id="-configuration-examples"></a>

### 🧷 Configuration Examples

1.  **Redis** (Recommended for production)
    ```bash
    MCP_TS_STORAGE_TYPE=redis
    REDIS_URL=redis://localhost:6379
    ```

2.  **SQLite** (Fast & Persistent)
    ```bash
    MCP_TS_STORAGE_TYPE=sqlite
    # Optional path
    MCP_TS_STORAGE_SQLITE_PATH=./sessions.db
    ```

3.  **Neon** (Serverless Postgres)
    ```bash
    MCP_TS_STORAGE_TYPE=neon
    NEON_DATABASE_URL=postgresql://user:password@host.neon.tech/dbname?sslmode=verify-full&channel_binding=require
    ```

4.  **File System** (Great for local dev)
    ```bash
    MCP_TS_STORAGE_TYPE=file
    MCP_TS_STORAGE_FILE=./sessions.json
    ```

5.  **In-Memory** (Default for testing)
    ```bash
    MCP_TS_STORAGE_TYPE=memory
    ```

---

<a id="gateway-setup-mcpassistant-gateway"></a>

## 🐍 Gateway Setup (mcpassistant-gateway)

The **MCP Gateway** is a Python-based bridge that allows local MCP servers to be accessed by remote applications via an outbound connection. This is useful for providing local context (like your filesystem) to a hosted AI agent.

<a id="installation-1"></a>

### 📦 Installation

```bash
pip install mcpassistant-gateway
```

### 🚀 Usage

<a id="usage"></a>

You can run the gateway using `uvx` or `pip`:

```bash
# Run the interactive menu
uvx mcpassistant-gateway menu

# Run the bridge directly
uvx mcpassistant-gateway run --name "local-files"
```

---

<a id="architecture"></a>

## 🏗️ Architecture

The MCP Toolkit supports two common runtime topologies:

```mermaid
graph LR
    subgraph Direct["Direct SDK Flow (TypeScript)"]
        UI[Browser UI]
        Hook[useMcp Hook]
        API[Next.js /api/mcp]
        Mgr[MultiSessionClient]
        Store[(Redis/File/Memory)]
        MCP[MCP Servers]

        UI <--> Hook
        Hook -- "HTTP RPC" --> API
        API --> Mgr
        Mgr -- "SSE events" --> Hook
        Mgr <--> Store
        Mgr <--> MCP
    end

    subgraph Bridge["Remote Bridge Flow (Python)"]
        direction TB
        Spacer[" "]
        Agent[mcpassistant-gateway]
        Remote[Remote Bridge Server]
        LocalMcp[Local MCP Servers]

        Spacer --- Agent
        Agent -- "WSS /connect (outbound)" --> Remote
        Agent <--> LocalMcp
        style Spacer fill:transparent,stroke:transparent,color:transparent
    end
```

- **Direct SDK flow**: Browser clients use `useMcp` over HTTP + SSE to a server route backed by `MultiSessionClient`.
- **Bridge flow**: `mcpassistant-gateway` keeps an outbound authenticated WebSocket to a remote bridge and forwards tool calls to local MCP servers.
- **Storage**: Session state and connection metadata persist in Redis, File, SQLite, or Memory backends.

> [!NOTE]
> This package (`@mcp-ts/sdk`) provides a unified MCP client with support for adapters and storage backends such as AI SDK, Mastra, LangChain, and Redis.
> Adapters and storage backends are loaded via **optional peer dependencies** and must be installed independently. This ensures your application only includes the integrations you explicitly choose, keeping bundle size small and avoiding unnecessary dependencies.
> The SDK includes built-in support for **Memory** and **File** storage, while additional backends (such as Redis) and adapters can be added without impacting users who don't need them.

For more details, refer to the documentation and follow the **installation guide for each adapter or storage backend**.

- [AI SDK Installation Guide](https://docs.mcp-assistant.in/ai-adapters/ai-sdk)
- [Mastra Installation Guide](https://docs.mcp-assistant.in/ai-adapters/mastra)
- [LangChain Installation Guide](https://docs.mcp-assistant.in/ai-adapters/langchain)
- [Redis Storage Installation Guide](https://docs.mcp-assistant.in/storage-backends/redis)


<a id="contributing"></a>

## 🤝 Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](packages/sdk/CONTRIBUTING.md) for guidelines on how to contribute.


<br />

<p align="center">
  <em>Thanks for visiting @mcp-ts!</em>
</p>

