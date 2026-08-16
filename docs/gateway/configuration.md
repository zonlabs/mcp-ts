---
title: "Gateway Configuration"
sidebarTitle: "Configuration"
description: "Configure mcp.json to define local stdio and HTTP/SSE MCP servers for the @mcp-ts/cli gateway daemon."
icon: "gear"
---

The MCP Gateway daemon (`mcpa serve` / `mcp-ts serve`) reads its server configurations from `mcp.json`.

### Configuration Discovery

The gateway automatically searches for `mcp.json` in:
1. Current working directory (`./mcp.json`)
2. Local `.mcpassistant/mcp.json`
3. Global user configuration (`~/.mcpassistant/mcp.json`)

To generate a starting template, run:
```bash
mcpa init
```

---

### `mcp.json` Schema

Add your local stdio and HTTP/SSE servers to the `mcpServers` object:

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "./data"]
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_..."
      }
    },
    "remote-service": {
      "url": "https://mcp.internal.company.com/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_TOKEN"
      }
    }
  }
}
```

---

### Starting the Daemon

Once configured, launch the gateway:

```bash
mcpa serve
```

The gateway aggregates all configured server tools, serves them on `http://127.0.0.1:8790/mcp`, and bridges them securely to `https://api.mcp-assistant.in` for cloud AI clients.
