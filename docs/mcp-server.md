---
title: "MCP Server"
sidebarTitle: "Remote MCP Server"
description: "Use the hosted MCP server from LinkOS to access remote MCP servers, dynamic discovery tools, and Code Mode from MCP clients."
icon: "cloud"
---

The hosted **MCP Server** gives MCP clients a single Streamable HTTP endpoint for working with [LinkOS](https://app.linkos.in/mcp).

## Endpoint

Use this URL in MCP clients that support Streamable HTTP:

```text
https://mcp.linkos.in/mcp
```

Connect and manage remote MCP servers from [app.linkos.in](https://app.linkos.in). The hosted endpoint uses those connected servers when MCP clients call LinkOS.

## What is the hosted MCP Server?

The MCP Server connects AI clients to MCP tools and remote app integrations through the Model Context Protocol.

Use it when you want an MCP client to access LinkOS without hosting your own server. After connecting remote MCP servers in [app.linkos.in](https://app.linkos.in), the LinkOS server can provide access to 100+ MCP servers, including GitHub, Notion, Zapier, Supabase, and other supported services.

It also exposes meta-tools for dynamic MCP discovery and a `CodeMode` tool that executes programs inside a secure sandbox for programmatic tool calling and result processing. This helps avoid expensive LLM tool-calling loops when a task is better handled as a small program.

## Who it is for

<CardGroup cols={2}>
  <Card title="For MCP Client Users" icon="terminal">
    Connect remote MCP servers in [app.linkos.in](https://app.linkos.in), then use them from MCP clients such as VS Code and Antigravity through one hosted endpoint.
  </Card>

  <Card title="For Developers" icon="code">
    Build agents with tool discovery, schema inspection, and CodeMode scripts across connected MCP servers.
  </Card>
</CardGroup>

## What it provides

- A hosted MCP endpoint for clients that support Streamable HTTP.
- Access to 100+ MCP servers, including GitHub, Notion, Zapier, Supabase, and other supported services.
- Meta-tools for dynamic MCP discovery across 100+ supported MCP servers.
- Server-side tool execution through LinkOS.
- `CodeMode` support for running small programs that call MCP tools inside a secure sandbox.
- A simple core flow: list servers, search tools, inspect schema, then run with CodeMode.
- Separate workflow tools for saving scripts and inspecting workflow state.

## Popular connected servers

| Server | Example tasks |
| --- | --- |
| GitHub | Create issues, inspect pull requests, search repositories, summarize project activity. |
| Notion | Search pages, update databases, organize notes, generate workspace summaries. |
| Zapier | Reach connected app actions and automate cross-app tasks. |
| Supabase | Query project data, inspect records, and support database-backed workflows. |
| Slack or Discord | Send messages, post updates, and route workflow notifications. |

## Example use cases

### Personal productivity

- Search connected tools and save useful results to Notion.
- Summarize recent GitHub activity and send a status update.
- Run a small CodeMode script for daily app checks.

### Development and operations

- Create a GitHub issue from a bug report.
- Query Supabase and summarize the result before returning it to the user.
- Chain multiple MCP tool calls inside `codemode_run` to avoid repeated LLM round trips.

### Code-based automation

- Search for the right connected MCP tool.
- Inspect its schema.
- Use `codemode_run` to call one or more tools in a small script.
- Return filtered, summarized, or transformed results to your MCP client.

## Main tools

The primary hosted MCP flow uses four tools: list, search, inspect, and run. Start here for most MCP clients.

| Tool | Category | Description |
| --- | --- | --- |
| `list_mcp_servers` | Search | List all connected MCP servers and the number of tools each provides. Use this when `search_mcp_tools` returns no response or irrelevant results. |
| `search_mcp_tools` | Search | Search connected MCP tools for the authenticated user and return normalized discovery results. Use this first before inspecting schemas or executing tools. |
| `get_mcp_tool_schema` | Read | Inspect the exact input schema, output schema when available, and CodeMode extraction hint for one connected MCP tool. |
| `codemode_run` | General | Execute a JavaScript/TypeScript-like script immediately in the CodeMode sandbox with connected MCP tool servers. Use it to validate tool calls, chain multiple calls, batch process results, or transform large outputs without creating a saved workflow. |

## Workflow tools (Experimental)

> [!WARNING]
> **Deprecation Notice:** Workflow and scheduling tools are experimental and may be removed at any time without notice.

Workflow and scheduling tools are separate from the main hosted MCP flow. Use them when you want to save scripts or inspect workflow metadata. Queued workflow execution is disabled on the hosted endpoint unless a dedicated worker service is running.

| Tool | Category | Description |
| --- | --- | --- |
| `workflow_list` | General | List script workflows with schedule and recent run summaries. |
| `workflow_get` | Read | Get one workflow, including schemas, script code/runtime, and schedules. |
| `workflow_upsert_script` | General | Create or update a script workflow that runs inside the `@mcp-ts/codemode` sandbox and can call connected MCP tools. |
| `schedule_upsert` | General | Create or update a UTC 5-field cron schedule. Set `is_enabled` to `false` to save a schedule without enqueueing runs. |
| `execution_log_list` | General | List recent workflow runs, optionally filtered by `workflow_id`. |
| `execution_log_get` | Read | Get details for a single workflow run by `execution_log_id`. |
| `workflow_run` | Optional | Run a saved workflow by enqueueing a BullMQ job. This requires a dedicated worker service and may not be available on the hosted endpoint. |
| `agent_run` | General | Call an LLM helper that returns structured `summary` and `analysis` output for explanation, interpretation, or recommendation-style reasoning. |

## Recommended MCP tool flow

When using connected MCP tools through the MCP Server:

1. Search for candidate tools with `search_mcp_tools`.
2. Inspect the selected tool with `get_mcp_tool_schema`.
3. Execute the call with `codemode_run`.

Inside CodeMode, scripts run as the body of an async function. Use `return` for the final value, and use `console.log` for debugging. Connected MCP tools are available through namespaced helpers and through `callTool(serverId, toolName, args)`. These helpers return normalized tool results by default; use raw helpers only when you need the original MCP envelope.

## Availability and health

The hosted endpoint is designed as a workerless remote MCP service. It keeps the Streamable HTTP MCP server online without running a separate BullMQ worker service. This reduces hosting cost and improves endpoint reliability for MCP clients that primarily need remote tool discovery and `codemode_run`.

Operational health is exposed at:

```text
https://mcp.linkos.in/healthz
```

The service also supports OpenTelemetry traces and metrics through OTLP for production monitoring.

## Client configuration

### VS Code

```json
{
  "servers": {
    "linkos": {
      "type": "http",
      "url": "https://mcp.linkos.in/mcp"
    }
  }
}
```

### Antigravity

```json
{
  "mcpServers": {
    "linkos": {
      "serverUrl": "https://mcp.linkos.in/mcp"
    }
  }
}
```

## Related docs

- [Tool Router](/core-concepts/tool-router)
- [Code Mode and tool search](/changelog/2026-05-18)
