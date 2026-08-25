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
    <a href="https://www.npmjs.com/package/@mcp-ts/cli">
      <img src="https://img.shields.io/npm/v/@mcp-ts/cli?color=3776ab&label=cli%20npm&logo=npm&style=flat-square" alt="CLI npm version" />
    </a>
    <a href="https://opensource.org/licenses/MIT">
      <img src="https://img.shields.io/badge/license-MIT-84cc16?style=flat-square" alt="License: MIT" />
    </a>
  </p>
</div>

<br />

## Why does `mcp-ts or toolkit` even exist?

The idea of connecting AI applications to tools is not new, and the ecosystem offers many great frameworks, hosted services, and integration platforms (such as Composio, Nango, Smithery, FastMCP, Manufact, Klavis Strata, Cloudflare Agents, and Pipedream). Developers can choose whichever service or platform best fits their requirements.

`mcp-ts` is a modular TypeScript client library for quick prototyping, experimentation, and production use. It supports connecting to local MCP servers through the gateway and to remote MCP servers, without routing private data through third-party proprietary clouds or adding per-call proxy markups.

`mcp-ts` exists to handle that application layer while keeping your MCP data in infrastructure you own or choose.

It gives you a practical foundation for building MCP-native apps:

- Have multiple users using your application
- Already using AI SDK, LangChain, Mastra, and AG-UI Protocol where handling oauth, tokens management for mcp clients seems overhead
- Reduce large model context with on-demand tool discovery through `ToolRouter`
- Review reproducible ToolRouter context-efficiency results in the [benchmark report](benchmarks/benchmark.md)
- Render interactive MCP Apps in your application
- Run programmatic tool calling inside a secure sandbox with `CodeMode`

See Anthropic's discussion of [advanced tool use](https://www.anthropic.com/engineering/advanced-tool-use) for related context.

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
mcpa serve          # Foreground gateway with live logs
mcpa daemon start   # The same gateway in the background
mcpa list           # Reuse either gateway, or auto-start the managed daemon

# Configure and use the gateway catalog
mcpa connect exa https://mcp.exa.ai/mcp
mcpa search "send email"
mcpa call exa::web_search_exa query="latest AI news"
mcpa call filesystem::read_file '{"path":"package.json"}' --json  # parse-only stdout for automation
mcpa login           # Authenticate remote catalog access
```

Normal `list`, `search`, `schema`, and `call` commands always use the single gateway. They reuse a healthy foreground or background gateway and start the managed daemon when stopped; they never switch to a direct remote HTTP or one-shot bridge path. A successful login activates a running local-only gateway in place. For full lifecycle, JSON output, and diagnostic details, see the [CLI Package README](packages/cli).

### Agent Skills

- Use [`mcp-cli`](skills/mcp-cli/SKILL.md) when a task invokes, automates, installs, or troubleshoots `mcpa` / `mcp-ts`. It covers the 0.3.0+ preflight, one-gateway lifecycle, authentication, catalog discovery, schema inspection, tool calls, and safe Node batching.
- Use [`mcp-assistant`](skills/mcp-assistant/SKILL.md) when a task needs dynamic MCP server/tool discovery, selective schema inspection, routing across connected services, or sandboxed multi-tool workflows without loading every tool into context.

---

## 📚 Documentation & Contributing

- **Full Documentation**: [docs.mcp-assistant.in](https://docs.mcp-assistant.in/)
- **Contributing**: [CONTRIBUTING.md](packages/client/CONTRIBUTING.md)
- **License**: [MIT](LICENSE)
