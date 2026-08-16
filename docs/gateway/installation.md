---
title: "Gateway Installation"
sidebarTitle: "Installation"
description: "Install the @mcp-ts/cli (mcpa / mcp-ts) and run the local gateway daemon to bridge stdio/HTTP MCP servers to remote clients."
icon: "download"
---

The MCP Gateway is distributed through the **`@mcp-ts/cli`** npm package.

### Global Installation

Install globally using your favorite package manager to get both the **`mcpa`** and **`mcp-ts`** binary commands:

```bash
npm install -g @mcp-ts/cli
```

### Run via npx

Alternatively, run directly with `npx` without global installation:

```bash
npx @mcp-ts/cli serve
```

---

### Initial Setup

Follow these quick steps to get your gateway up and running:

1. **Initialize configuration**:
   ```bash
   mcpa init
   ```
   This generates an `mcp.json` file in your current directory.

2. **Authenticate with MCP Assistant**:
   ```bash
   mcpa login
   ```
   This opens your browser for an OAuth + PKCE sign-in and saves the rotating CLI session in your platform user-config directory.

3. **Start the Gateway**:
   ```bash
   mcpa serve
   ```
   The gateway daemon starts your configured MCP servers, serves a local HTTP endpoint (`http://127.0.0.1:8765/mcp`), and opens an outbound WebSocket tunnel to `https://api.mcp-assistant.in`.
