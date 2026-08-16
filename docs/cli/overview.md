---
title: "Developer CLI Overview"
sidebarTitle: "CLI Overview"
description: "Explore remote MCP servers, test and benchmark tool discovery, generate TypeScript client wrappers, and run the local MCP gateway daemon with @mcp-ts/cli."
icon: "terminal"
---

The **@mcp-ts/cli** (`mcpa` / `mcp-ts`) is an all-in-one developer CLI and gateway daemon for the Model Context Protocol.

It allows you to inspect remote MCP endpoints, test on-demand tool discovery, generate typed wrappers, and bridge local MCP servers to remote assistants such as ChatGPT, Claude, and MCP Assistant with zero firewall configuration.

```bash
# Global install (gives you both `mcpa` and `mcp-ts`)
npm install -g @mcp-ts/cli

# Or run directly via npx
npx @mcp-ts/cli [command]
```

---

## ⚡ Key Capabilities

<CardGroup cols={2}>
  <Card title="Local MCP Gateway" icon="server" href="/gateway/overview">
    Run local stdio and HTTP/SSE MCP servers, aggregate tools, and expose a clean local HTTP endpoint (`http://127.0.0.1:8790/mcp`).
  </Card>
  <Card title="Remote Bridge" icon="cloud" href="/gateway/configuration">
    Sign in via OAuth (`mcpa login`) and bridge local servers to remote AI assistants over an outbound JSON-RPC WebSocket.
  </Card>
  <Card title="Interactive REPL" icon="terminal" href="/cli/commands#connect">
    Connect to any remote MCP server to search tools, view JSON schemas, and execute calls interactively.
  </Card>
  <Card title="Tool Wrappers Codegen" icon="code" href="/cli/commands#codegen">
    Generate type-safe TypeScript wrappers from server tool schemas with zero runtime dependencies.
  </Card>
</CardGroup>

---

## 🚀 Quick Start

### 1. Initialize and Run Local Gateway
```bash
# Generate a starter mcp.json in the current directory
mcpa init

# Run the local gateway daemon
mcpa serve
```

### 2. Sign in to MCP Assistant
```bash
# Authenticate your machine with MCP Assistant
mcpa login

# Start daemon with automated remote bridging
mcpa serve
```

### 3. Explore a Remote MCP Server
```bash
# Start an interactive REPL
mcpa connect https://api.example.com/mcp

# Search for specific tools
mcpa search https://api.example.com/mcp "send message"
```
