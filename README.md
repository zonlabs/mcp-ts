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
    <a href="https://www.npmjs.com/package/@mcp-ts/client">
      <img src="https://img.shields.io/npm/v/@mcp-ts/client?color=dc2626&label=npm&logo=npm&style=flat-square" alt="npm version" />
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
- Render interactive MCP Apps in your application
- Run programmatic tool calling inside a secure sandbox with `CodeMode`

In short: the official MCP SDK gives you the protocol building blocks. `mcp-ts` gives you the application layer for building MCP applications around them.

## When you may not need it?

If you already use a managed service/platform such as Smithery, Klavis Strata, Composio, nango or a similar SDK, you may not need `mcp-ts`.

---

## 📦 Packages

| Package | Description | Location |
| :--- | :--- | :--- |
| **[@mcp-ts/client](packages/client)** | Core TypeScript/JavaScript SDK with durable storage, OAuth 2.1, and framework adapters. | [`packages/client`](packages/client) |
| **[@mcp-ts/cli](packages/cli)** | Developer CLI & local/remote MCP gateway daemon (`mcpa` / `mcp-ts`). | [`packages/cli`](packages/cli) |
| **[@mcp-ts/tool-router](packages/tool-router)** | On-demand dynamic tool discovery across many MCP servers. | [`packages/tool-router`](packages/tool-router) |
| **[@mcp-ts/codemode](packages/code-mode)** | Sandboxed programmatic tool calling and execution. | [`packages/code-mode`](packages/code-mode) |

---

## 🌐 Hosted MCP Endpoints

### MCP Assistant Server
- **Endpoint**: `https://api.mcp-assistant.in/mcp`
- Access 100+ MCP tools (GitHub, Notion, Zapier, Supabase, etc.), dynamic tool discovery, and sandboxed `CodeMode` execution.

#### Antigravity / Cursor / VS Code Configuration

```json
{
  "mcpServers": {
    "mcp-assistant": {
      "serverUrl": "https://api.mcp-assistant.in/mcp"
    }
  }
}
```

### Documentation MCP
- **Endpoint**: `https://docs.mcp-assistant.in/mcp`
- Access `mcp-ts` and toolkit documentation directly over MCP.

---

## 💻 CLI (`@mcp-ts/cli`)

Install globally or run via `npx` (provides both `mcpa` and `mcp-ts` commands):

```bash
npm install -g @mcp-ts/cli
```

### Quick Commands

```bash
mcpa serve # Start the cli

# Cli Usage
mcpa connect exa https://mcp.exa.ai/mcp
mcpa search "send email"
# Execute tools directly (one-shot or chained)
mcpa call exa::web_search_exa query="latest AI news"


# Run local MCP gateway daemon
mcpa init       # Create default mcp.json
mcpa login      # Authenticate with remote gateway
```

For full details, see the [CLI Package README](packages/cli).

---

## 📚 Documentation & Contributing

- **Full Documentation**: [docs.mcp-assistant.in](https://docs.mcp-assistant.in/)
- **Contributing**: [CONTRIBUTING.md](packages/client/CONTRIBUTING.md)
- **License**: [MIT](LICENSE)
