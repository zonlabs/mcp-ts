---
title: "Agent Skills"
sidebarTitle: "Agent Skills"
description: "Install and configure agent-specific skills for LinkOS to guide tool selection, schema inspection, and sandboxed execution."
icon: "brain"
---

Agent skills provide LLMs and coding assistants with curated instructions, guidelines, and context-specific rules for executing tasks. 

LinkOS publishes a pre-configured skill, `linkos`, which instructs coding agents on how and when to use remote MCP servers, when to search for tools, and how to chain calls inside the CodeMode sandbox.

## Installing the Skill

Install the LinkOS skill into your local workspace using the `skills` CLI:

```bash
npx skills add zonlabs/mcp-ts --skill linkos
```

This downloads and configures the `linkos` skill folder in your workspace under `.agents/skills/linkos/`.

## Updating the Skill

To update the skill to the latest version, run the `update` command:

```bash
npx skills update linkos
```

If you are developing or testing local changes to the skill files in this repository, you can sync your local workspace files directly:

```bash
npx skills add ./ --skill linkos
```

## The `linkos` Skill

### Core Principle

> **Keep MCP tools discoverable, not always loaded.**
>
> Avoid loading every downstream MCP tool directly into the agent context, which can bloat the context window and cause tool-calling confusion. Instead, search for the relevant capability, inspect only the needed schema, then execute the selected tool or workflow through the sandboxed runner.

### Available Tools

| Tool | Category | Purpose |
| --- | --- | --- |
| `search_mcp_tools` | Search | Search connected MCP servers for candidate tools using natural language or exact names. |
| `get_mcp_tool_schema` | Read | Inspect the exact parameters and output shape for a selected tool. |
| `codemode_run` | General | Run a TypeScript/JavaScript script inside a secure sandbox to execute tool chains. |

### Recommended Workflow

When a task requires external tools or services connected to LinkOS, the agent follows this default flow:

1. **Identify the need:** Determine if the goal requires an external MCP integration (e.g., GitHub, Notion, Supabase, Slack).
2. **Search tools:** Call `search_mcp_tools` with a goal-oriented query (e.g. `"find GitHub issues by label"`).
3. **Select candidates:** Choose the most relevant tools from the search results.
4. **Inspect schema:** Call `get_mcp_tool_schema` to retrieve the parameters and constraints for the chosen tools.
5. **Execute:** Run the code/script using `codemode_run` to execute the tools and transform the output in the sandbox.

### Safety & Approvals

Before executing destructive, public, or outbound communication actions, the agent must ask for user confirmation.
- **Needs Approval:** Sending messages (Slack, Gmail, Discord), mutating production database records, closing issues, merging pull requests, or running expensive workflows.
- **Safe to run:** Read-only queries, searching, listing, and local summarization.
