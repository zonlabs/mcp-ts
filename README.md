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

## 📖 Table of Contents

- [✨ Features](#-features)
- [📦 Packages](#-packages)
- [🛠️ SDK Setup (@mcp-ts/sdk)](#️-sdk-setup-mcp-tssdk)
  - [📦 Installation](#-installation)
  - [🚀 Quick Start](#-quick-start)
- [🐍 Gateway Setup (mcpassistant-gateway)](#-gateway-setup-mcpassistant-gateway)
  - [📦 Installation](#-installation-1)
  - [🚀 Usage](#-usage)
- [🏗️ Architecture](#️-architecture)
- [📚 Documentation](#-documentation)
- [⚙️ Environment Setup](#️-environment-setup)
- [🧪 Examples](#-examples)
- [💡 Inspiration](#-inspiration)

---

## 📦 Packages

| Package | Description | Install |
| :--- | :--- | :--- |
| **[@mcp-ts/sdk](src)** | TypeScript/JavaScript SDK for clients & servers. | `npm i @mcp-ts/sdk` |
| **[mcpassistant-gateway](packages/mcp-local-agent)** | Python bridge for local MCP support in remote apps. | `pip install mcpassistant-gateway` |

---

## ✨ Features

Most features are available out-of-the-box in the **TypeScript SDK**:

- **SSE** - Server-Sent Events for connection state and observability updates
- **Flexible Storage** - Redis, SQLite, File System, or In-Memory backends
- **Serverless** - Works in serverless environments (Vercel, AWS Lambda, etc.)
- **React Hook** - `useMcp` hook for easy React integration
- **Vue Composable** - `useMcp` composable for Vue applications
- **MCP Protocol** - Support for tools, prompts, and resources
- **Agent Adapters** - Built-in adapters for AI SDK, LangChain, Mastra, and AG-UI
- **MCP Apps Extension (SEP-1865)** - Interactive UI-driven tool interfaces

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

## 💡 Inspiration

> I got the idea for `@mcp-ts` while working on 🌐 **[MCP Assistant](https://mcp-assistant.in)**.
As the project grew, I had a few problems: storage, using different AI frameworks like LangGraph and ADK for different use cases, and figuring out how to get progressive SSE updates at each step so I could see what was happening.
So with that idea in mind, I built this SDK to make setup easier and keep the user experience smooth.
That’s how `@mcp-ts` started.

<br/>

<div align="center">
  <img src="docs/images/mcp-assistant.png" alt="MCP Assistant" width="100%" />
</div>

<br/>

## 🛠️ SDK Setup (@mcp-ts/sdk)

### 📦 Installation

```bash
npm install @mcp-ts/sdk
```

The SDK supports multiple storage backends out of the box:
- **Memory** (default, no setup required)
- **File** (local persistence)
- **SQLite** (fast local persistence, requires `npm install better-sqlite3`)
- **Redis** (production-ready, requires `npm install ioredis`)

### 🚀 Quick Start

#### 🖥️ Server-Side (Next.js)

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

### 🎯 Client-Side (React)

```typescript
'use client';

import { useMcp } from '@mcp-ts/sdk/client/react';

function App() {
  const { connections, connect } = useMcp({
    url: '/api/mcp',
    identity: 'user-123',
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

### 🔌 Adapters

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
  const { messages, identity } = await req.json();
  const client = new MultiSessionClient(identity);

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

Render interactive UIs for your tools using the `useMcpApps` hook.

<details>
<summary>View MCP Apps</summary>

```typescript
import { useRenderToolCall } from "@copilotkit/react-core";
import { useMcpApps } from "@mcp-ts/sdk/client/react";
import { useMcpContext } from "./mcp";

export function ToolRenderer() {
  const { mcpClient } = useMcpContext();
  const { McpAppRenderer } = useMcpApps(mcpClient);

  useRenderToolCall({
    name: "*",
    render: ({ name, args, result, status }) => (
      <McpAppRenderer
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

## 📚 Documentation

Full documentation is available at: **[Docs](https://docs.mcp-assistant.in/)**

### 🗂️ Topics Covered:

- **[Getting Started](https://docs.mcp-assistant.in/get-started)** - Quick setup and overview
- **[Installation](https://docs.mcp-assistant.in/install)** - Detailed installation guide
- **[Storage Backends](https://docs.mcp-assistant.in/storage/overview)** - Redis, File, Memory options
- **[Next.js Integration](https://docs.mcp-assistant.in/nextjs)** - Complete Next.js examples
- **[React Hook Guide](https://docs.mcp-assistant.in/react)** - Using the useMcp hook
- **[API Reference](https://docs.mcp-assistant.in/api-reference/server)** - Complete API documentation

## ⚙️ Environment Setup

The library supports multiple storage backends. You can explicitly select one using `MCP_TS_STORAGE_TYPE` or rely on automatic detection.

**Supported Types:** `redis`, `sqlite`, `file`, `memory`.

### 🧷 Configuration Examples

1.  **<img src="docs/images/storage-backend/redis.svg" width="20" height="20" align="center" /> Redis** (Recommended for production)
    ```bash
    MCP_TS_STORAGE_TYPE=redis
    REDIS_URL=redis://localhost:6379
    ```

2.  **<img src="docs/images/storage-backend/sqlite.svg" width="20" height="20" align="center" /> SQLite** (Fast & Persistent)
    ```bash
    MCP_TS_STORAGE_TYPE=sqlite
    # Optional path
    MCP_TS_STORAGE_SQLITE_PATH=./sessions.db
    ```

3.  **<img src="docs/images/storage-backend/filesystem.svg" width="20" height="20" align="center" /> File System** (Great for local dev)
    ```bash
    MCP_TS_STORAGE_TYPE=file
    MCP_TS_STORAGE_FILE=./sessions.json
    ```

4.  **<img src="docs/images/storage-backend/memory.svg" width="20" height="20" align="center" /> In-Memory** (Default for testing)
    ```bash
    MCP_TS_STORAGE_TYPE=memory
    ```

---

## 🐍 Gateway Setup (mcpassistant-gateway)

The **MCP Gateway** is a Python-based bridge that allows local MCP servers to be accessed by remote applications via an outbound connection. This is useful for providing local context (like your filesystem) to a hosted AI agent.

### 📦 Installation

```bash
pip install mcpassistant-gateway
```

### 🚀 Usage

You can run the gateway using `uvx` or `pip`:

```bash
# Run the interactive menu
uvx mcpassistant-gateway menu

# Run the bridge directly
uvx mcpassistant-gateway run --name "local-files"
```

---

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
> The SDK includes built-in support for **Memory** and **File** storage, while additional backends (such as Redis) and adapters can be added without impacting users who don’t need them.

For more details, refer to the documentation and follow the **installation guide for each adapter or storage backend**.

- [AI SDK Installation Guide](https://docs.mcp-assistant.in/adapters/ai-sdk)
- [Mastra Installation Guide](https://docs.mcp-assistant.in/adapters/mastra)
- [LangChain Installation Guide](https://docs.mcp-assistant.in/adapters/langchain)
- [Redis Storage Installation Guide](https://docs.mcp-assistant.in/storage/redis)


## 🤝 Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines on how to contribute.


<br />

<p align="center">
  <em> Thanks for visiting ✨ @mcp-ts!</em><br><br>
  <img src="https://visitor-badge.laobi.icu/badge?page_id=zonlabs.mcp-ts&style=for-the-badge&color=00d4ff" alt="Views">
</p>

