---
title: "Docs as an MCP server"
sidebarTitle: "MCP"
description: "Connect Claude Desktop, Cursor, and other MCP clients to the mcp-ts documentation server to search and read guides without leaving your AI assistant."
icon: "puzzle-piece"
---

The `mcp-ts` documentation is available as a Model Context Protocol (MCP) server. This allows AI assistants and IDEs that support MCP to discover, search, and read the documentation directly during a conversation.

### Endpoint URL

The documentation server is hosted at:

```bash
https://docs.mcp-assistant.in/mcp
```

### How to Use

You can add this server to your preferred MCP-compatible client (such as Claude Desktop, Cursor, or VS Code). The server provides powerful tools to interact with the documentation:

- **Search (`search_mcp_toolkit`)**: Search across the entire MCP Toolkit knowledge base to find relevant guides, code examples, and API references.
- **Query Filesystem (`query_docs_filesystem_mcp_toolkit`)**: Perform shell-like queries (using `cat`, `head`, `rg`, `tree`, etc.) against a virtualized documentation filesystem to read full pages or search for exact keyword matches.
- **Resources**: Access the `mintlify://skills/zonlabs` resource for high-level context on building agentic workflows with MCP.

This integration allows AI assistants to maintain accurate context regarding `mcp-ts` implementation details without requiring manual copy-pasting.
