---
title: "Meta Tools"
sidebarTitle: "Meta Tools"
description: "Reference for the Tool Router meta-tools that let LLMs search, list, and execute tools on demand to keep large MCP catalogs out of the context window."
---

When the `ToolRouter` is set to the `search` strategy, it hides your real MCP tools and instead exposes a small set of **Meta-Tools**. 

These tools follow the "Tool Search" pattern, allowing the LLM to autonomously find, inspect, and execute relevant capabilities from a massive catalog.

## The meta-tool catalog

### `mcp_search_tools`
The primary entry point for discovery. The LLM calls this with a natural language query to find tools. The backend uses an in-memory BM25 index combined with smart heuristics to rank results.
- **Input**: `query` (string), `operation` (`"search"` or `"list"`), `serverId`/`serverName` (optional), `limit` (number), `cursor` (optional).
- **Output**: A list of tool names, descriptions, and the servers they belong to.

#### Advanced search features
The `mcp_search_tools` meta-tool supports a powerful query syntax that helps the AI zero in on exact capabilities without context bloat:

- **Direct Tool Selection (`select:<name>`)**: If the AI already knows the exact tool it wants to use (e.g., from past context), it can bypass the BM25 index entirely.
  - *Example*: `select:github_create_issue` returns the exact tool description instantly.
  - `select:` uses the same server scoping fields as search. If the connected server is named `Database MCP`, then `query: "select:list_tables", serverName: "database"` can resolve `list_tables` because `serverName` is treated as a case-insensitive fragment.
- **Required Terms (`+term`)**: By prefixing a word with `+`, the AI strictly forces the index to *only* return tools that contain that word in their name or description.
  - *Example*: `+slack send` guarantees that only tools belonging to Slack are returned, even if another tool uses the word "send" frequently.
- **Server Scoping**: Pass `serverId` or `serverName` to restrict results to one connected MCP server. Use `serverId` when you have the exact ID; use `serverName` when you only know a human-readable fragment.
  - *Example*: `query: "tables", serverName: "database"` searches only servers with names or IDs containing `database`, such as `Database MCP`.
  - *Example*: `query: "tables", serverId: "database-server"` searches only the exact server ID `database-server`.
- **Deterministic Server Listing**: Pass `operation: "list"` with `serverId` or `serverName` when the user asks for every tool from a server.
  - *Example*: `query: "database", operation: "list", serverName: "database"` returns the matching server's tools with `totalCount`, `returnedCount`, and `nextCursor` metadata.
- **Enhanced Scoring Heuristics**: Behind the scenes, the BM25 index automatically grants massive score bonuses (+10 or +5 points) if a search term perfectly matches or is a substring of the MCP `serverName` or the tool `name`. This ensures that tools strictly related to a specific integration (e.g., querying for "neon" or "apify") always float above unrelated tools that merely mention the word in their parameters.


### `mcp_list_servers`
A diagnostic tool that allows the LLM to inspect which MCP servers are currently connected and available.
- **Input**: `query` (optional string for filtering by server name or ID).
- **Output**: A list of connected servers, their IDs, and tool counts.
- **Usage**: Use this when `mcp_search_tools` returns no matches to discover what servers are active, then retry the search with a specific `serverId` or `serverName`.

### `mcp_search_tool_regex`
A precision tool for finding specific patterns in tool names or descriptions.
- **Input**: `query` (Regex string), `limit` (number).
- **Output**: Matching tools.
- **Usage**: `^github_.*` → returns all tools starting with "github_".

### `mcp_get_tool_schema`
Load the technical details for a specific tool.
- **Input**: `toolName` (string), `serverId` (optional string).
- **Output**: The full JSON `inputSchema` for the requested tool.
- **Requirement**: The LLM *must* call this after searching to know what arguments a tool accepts.

### `mcp_execute_tool`
The proxy executor for all discovered tools.
- **Input**: `toolName` (string), `args` (object), `serverId` (optional string).
- **Output**: The result of the actual MCP tool call.
- **Privacy**: The SDK handles the routing to the correct MCP server automatically.

---

## The discovery lifecycle

The `mcp-ts` SDK implements the following flow to minimize context usage while maintaining capability:

<Steps>
  <Step title="Initial Injection">
    The SDK injects only the 5 Meta-Tools into the LLM context (cost: ~500 tokens).
  </Step>
  <Step title="Discovery (Search)">
    When the user asks for a specific capability, the LLM calls `mcp_search_tools` or `mcp_search_tool_regex`.
  </Step>
  <Step title="Inspection (Get Schema)">
    Based on search results, the LLM calls `mcp_get_tool_schema` for the most relevant tool to see its parameters.
  </Step>
  <Step title="Execution">
    The LLM calls `mcp_execute_tool` with the constructed arguments. The SDK routes this call to the matching MCP server and returns the result.
  </Step>
</Steps>

## Why use meta-tools?

1. **Context Density**: You can give an LLM access to 1,000 tools without using more than a few hundred tokens of "resting" context.
2. **Reduced Hallucinations**: Because the LLM "finds" the tool definition right before using it, it is less likely to hallucinate parameters or use the wrong tool.
3. **Multi-Server Conflict Resolution**: If two servers provide a tool named `search`, the Meta-Tools return `serverName` and `serverId`. Use `serverName` fragments for discovery and `serverId` for exact schema lookup/execution.
