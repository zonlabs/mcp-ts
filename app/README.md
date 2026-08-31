<div align="center">
  <img src="./public/logo.svg" alt="MCP Assistant Logo" width="96" height="96" />
  <h1>MCP Assistant</h1>
  <img src="./public/images/mcpassistant.png" alt="MCP Assistant Banner" width="100%" />
  <p><strong>Web-based MCP client for remote servers and AI tools.</strong></p>

  [![Website](https://img.shields.io/badge/Website-mcp--assistant.in-0A66C2?style=for-the-badge&logo=googlechrome&logoColor=white)](https://www.mcp-assistant.in/)
  [![Docs](https://img.shields.io/badge/Docs-docs.mcp--assistant.in-111827?style=for-the-badge&logo=readthedocs&logoColor=white)](https://docs.mcp-assistant.in/)
  [![License](https://img.shields.io/badge/License-MIT-16A34A?style=for-the-badge&logo=opensourceinitiative&logoColor=white)](LICENSE)
</div>

## 🌐 Overview

MCP Assistant addresses common pain points when working with the Model Context Protocol:

## ✨ Why MCP Assistant

- Connect to remote MCP servers from one interface
- Manage multiple MCP servers from a single interface
- Handle OAuth 2.0 and OpenID Connect flows without manual token juggling
- Explore available tools and run them directly from the UI
- Monitor connections in real time while testing and debugging integrations
- Work from anywhere without local MCP server setup

## 🚀 Core Capabilities

- Connect and manage MCP servers from a single workspace
- Discover available tools and execute them from the UI
- Handle OAuth/OIDC auth flows for protected MCP servers
- Browse registry servers and test integrations before production use

## 🏗️ Architecture

```mermaid
flowchart TD
    subgraph Browser["Browser"]
        B[User Browser]
    end

    subgraph MCPA["MCP Assistant"]
        subgraph UI["UI"]
            direction TB
            MAR["MCP Assistant Registry"]
            MPR["Model Context Protocol Registry"]
            PG["Playground"]
        end

        subgraph Backend["Backend"]
            LA["LangGraph Agent"]
            DB[("Database")]
        end
    end

    subgraph External["External APIs"]
        MCP_IO["modelcontextprotocol.io"]
    end

    subgraph ToolsResources["Tools / Resources"]
        C7["Context7"]
        DW["DeepWiki"]
    end

    B -- "HTTPS" --> UI
    MAR -- "GraphQL" --> DB
    PG -- "Execute" --> LA
    MPR -- "HTTPS" --> MCP_IO
    PG -- "AG-UI state (URL, transport, auth token, etc.)" --> LA
    UI -- "MCP protocol" --> ToolsResources
    LA -- "MCP protocol" --> ToolsResources
```

## ⚡ Quick Start

### ➕ Add an MCP Server

1. Open the MCP Servers page.
2. Click `Add Server`.
3. Enter:
   - `Server Name`
   - `Server URL`
   - Optional OAuth2 configuration
4. Save to connect.

## 🤝 Contributing

Contributions are welcome.  
Please open an issue for major changes or submit a pull request directly for improvements and fixes.
