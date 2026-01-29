---
sidebar_position: 1
slug: /
---

import { DocIcon } from '@site/src/components/DocIcons';
import { FrameworkList } from '@site/src/components/FrameworkList';
import useBaseUrl from '@docusaurus/useBaseUrl';

# Getting Started

**mcp-ts** is a lightweight MCP (Model Context Protocol) client library for JavaScript applications. It provides seamless integration for both server-side and client-side MCP connections with real-time updates.

## Why mcp-ts?

1. **Simple API** — Easy-to-use methods for connecting to MCP servers
2. **Framework Ready** — Built-in support for Next.js, React, and Vue
3. **Real-Time & Observability** — Live updates via Server-Sent Events (SSE)
4. **Persistent Sessions** — Automatic session management and recovery
5. **TypeScript** — Full type safety with TypeScript support
6. **Flexible Storage** — Multiple backend options (Redis, FS, Memory)

## Quick Install

```bash
npm install @mcp-ts/sdk
```

## Framework Guides

We provide first-class support for popular frameworks:

<FrameworkList />

## Integrations

### <img src={useBaseUrl('/img/framework/vercel.svg')} width={20} height={20} style={{ verticalAlign: 'middle' }} /> Vercel AI SDK

mcp-ts provides first-class support for the Vercel AI SDK.
- **Aggregated Tools** — Use `MultiSessionClient` to combine tools from multiple MCP servers.
- **Streaming** — Perfect integration with `streamText` and `useChat`.




## Core Concepts

Understanding these pieces will help you build faster:

1. **Storage Backend** — Where your MCP session data lives. Use [Redis](./storage-backends.md#redis) for production or [File System](./storage-backends.md#file-system) for local dev.
2. **Server Handler** — The API route that bridges your storage and the client. See [Next.js](./nextjs.md) or [Installation](./installation.md#server-side-setup).
3. **Client Hook** — The frontend composable/hook that manages the SSE connection and tool calls.
4. **Adapters** — Transform MCP tools into framework-specific formats. See [Adapters](./adapters.md).
5. **AG-UI Middleware** — Execute MCP tools server-side when using remote agents. See [AG-UI Middleware](./adapters.md#ag-ui-middleware).

## Next Steps

- **[Installation](./installation.md)** — Detailed manual setup instructions
- **[Storage Backends](./storage-backends.md)** — Deep dive into storage options
- **[API Reference](./api-reference.md)** — Full technical documentation

