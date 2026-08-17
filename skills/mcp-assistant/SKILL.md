---
name: mcp-assistant
description: Use when a task needs connected MCP servers, external services, dynamic MCP tool discovery, schema inspection, sandboxed MCP execution, or routing across many possible MCP tools.
---

# MCP Assistant

Use MCP Assistant when a task needs tools from connected MCP servers, especially when many possible servers or tools may be available. Prefer MCP Assistant's discovery and routing tools instead of loading every downstream MCP tool directly into the agent context.

MCP Assistant server:

```text
https://api.mcp-assistant.in/mcp
```

User connection page:

```text
https://mcp-assistant.in/mcp
```

## What MCP Assistant Provides

MCP Assistant provides access to 100+ MCP servers such as GitHub, Notion, Zapier, Supabase, Exa, DeepWiki, Apify, Context7 and other connected services.

It exposes meta-tools for dynamic MCP discovery and a CodeMode tool that executes programs inside a secure sandbox for programmatic tool calling and result processing. Use this to avoid expensive LLM tool-calling loops when a task can be handled by discovering the right tools, inspecting only the needed schemas, executing a small program, and returning the final result.

## Core Principle

Keep MCP tools discoverable, not always loaded.

Do not assume the agent needs every connected tool schema in context. Use MCP Assistant to search for the relevant capability, inspect only the needed schema, then execute the selected tool or workflow through the sandboxed runner.

## Available MCP Assistant Tools

### `list_mcp_servers`

List all currently connected upstream MCP servers and their indexed tool counts.

Use this to inspect which services are active or to filter by server name/ID:

```text
query: "github" (optional filter)
```

### `search_mcp_tools`

Search connected MCP servers for relevant tools.

Use this first when the task may require an external service such as GitHub, Notion, Slack, Gmail, Linear, Supabase, Exa, Zapier, cloud providers, databases, or any other connected MCP server.

Search with the user's goal, not just a tool name. For example:

```text
find GitHub issues by label
post a message to Slack
search the web with Exa
create a Notion page
query Supabase rows
```

If no relevant tools are found, tell the user they likely need to connect the relevant MCP server at:

```text
https://mcp-assistant.in/mcp
```

### `get_mcp_tool_schemas`

Inspect the exact JSON input/output schemas for one or more selected MCP tools using their canonical tool IDs (`serverId::toolName`) before executing them:

```json
{
  "toolIds": ["github::search_issues", "notion::create_page"]
}
```

Read the required parameters, optional parameters, expected result shape, and any server-specific constraints. Do not guess parameter names for downstream MCP tools. Inspect the schema first.

### `call_mcp_tool`

Execute a single downstream MCP tool directly:

```json
{
  "toolId": "github::create_issue",
  "args": {
    "owner": "mcp-ts",
    "repo": "mcp",
    "title": "Bug report"
  }
}
```

Use `call_mcp_tool` when you only need to run a single tool invocation without spinning up a full `codemode_run` script sandbox.

### `codemode_run`

Execute downstream MCP tool calls inside MCP Assistant's secure remote workbench.

Use this to call one or more selected MCP tools after inspecting their schemas. Prefer batching or chaining multiple dependent tool calls inside one `codemode_run` when it avoids unnecessary agent-visible intermediate results.

Good uses:

- Search GitHub issues, fetch related PRs, summarize the result.
- Query a database, filter rows, and return only the final answer.
- Search Exa, rank results, and return the most relevant sources.
- Create or update records across connected tools when the steps are clear.
- Transform, sort, deduplicate, or aggregate tool results before returning them to the agent.

Avoid using `codemode_run` for a long chain when the agent needs to inspect and decide after each step. In that case, run one stage, examine the result, then continue.


## Default Workflow

1. Decide whether the task needs an external MCP capability.
2. Call `search_mcp_tools` with a goal-oriented query (or `list_mcp_servers` to verify connected services).
3. Choose the smallest set of relevant tools from the search result.
4. For the selected tools, call `get_mcp_tool_schemas` with their `toolIds`.
5. Call `call_mcp_tool` for single invocations, or `codemode_run` for multi-tool batches and data transformations.
6. Return the final result to the user, not every intermediate object unless it is useful.

## When To Batch Tool Calls

Batch multiple calls inside `codemode_run` when:

- The task has three or more dependent tool calls.
- Intermediate results only exist to feed later steps.
- The result needs filtering, sorting, grouping, or transformation.
- The execution crosses multiple MCP servers.
- Returning every intermediate result would bloat the agent context.

Do not batch when:

- The user needs to approve an action before it happens.
- The agent must inspect an intermediate result to choose the next step.
- A tool call is destructive or sends messages externally without clear user intent.
- Required parameters are missing or ambiguous.

## Safety And Approval

Before making external changes, confirm user intent if the action is destructive, public, irreversible, or sends communication to other people.

Examples that usually need confirmation:

- Sending Slack, Gmail, Discord, or other outbound messages.
- Creating, deleting, or modifying production data.
- Closing issues, merging PRs, changing permissions, or deploying services.
- Running expensive tool chains or broad data exports.

Read-only discovery, search, listing, and summarization can usually proceed without extra confirmation.

## Failure Handling

If `search_mcp_tools` finds no relevant tools:

```text
I could not find a connected MCP tool for this. Please connect the relevant MCP server at https://mcp-assistant.in/mcp, then I can search again.
```

If a selected tool schema is unclear, inspect another candidate tool or ask the user for the missing required input.

If `codemode_run` fails, summarize the error, identify whether it was caused by missing auth, missing parameters, unavailable server tools, or sandbox execution failure, then retry only when the fix is clear.

## CodeMode Invocation Patterns

Inside `codemode_run`, the sandbox provides two flexible ways to invoke tools:

### Pattern A: Raw `callTool(serverId, toolName, args)` (Recommended for Dynamic Calls)
Ideal when server IDs contain hyphens (e.g. `chrome-devtools`), when dynamically selecting servers, or when writing parameterized loops:

```javascript
// Direct callTool invocation
const res = await callTool("github", "search_issues", {
  q: "repo:mcp-ts/mcp is:open is:pr",
});

// Dynamic batch dispatch across servers
const servers = ["github", "supabase"];
const statusReports = await Promise.all(
  servers.map((id) => callTool(id, "health_check", {}))
);
```

### Pattern B: Namespaced Proxy `serverId.toolName(args)` (Recommended for Clean Scripts)
Clean, idiomatic syntax available for all connected servers:

```javascript
const issue = await github.get_issue({
  owner: "mcp-ts",
  repo: "mcp",
  issue_number: 42,
});
```

---

## Example Patterns & CodeMode Scripts

### 1. Bulk / Batch Operations with `callTool` (Process Items in Parallel Chunks)

Use `Promise.all` with chunking and `callTool` to process items in parallel without hitting rate limits:

```javascript
// Step 1: Query open bug issues using callTool
const searchResult = await callTool("github", "search_issues", {
  q: "repo:mcp-ts/mcp is:open is:issue label:bug",
});
const issues = searchResult.items ?? [];

// Step 2: Process issues in parallel batches of 5
const BATCH_SIZE = 5;
const processed = [];

for (let i = 0; i < issues.length; i += BATCH_SIZE) {
  const batch = issues.slice(i, i + BATCH_SIZE);
  const batchDetails = await Promise.all(
    batch.map(async (issue) => {
      const details = await callTool("github", "get_issue", {
        owner: "mcp-ts",
        repo: "mcp",
        issue_number: issue.number,
      });
      return {
        number: issue.number,
        title: issue.title,
        commentsCount: details.comments,
        author: issue.user?.login,
      };
    })
  );
  processed.push(...batchDetails);
}

// Return concise aggregated data (avoids LLM context bloat)
return {
  total: issues.length,
  highCommentBugs: processed.filter((item) => item.commentsCount > 3),
};
```

---

### 2. Multi-Server Pipeline with `callTool` (Exa Search ➔ Data Transform ➔ Slack/Notion)

Chain operations across multiple servers in a single sandbox execution using `callTool`:

```javascript
// Step 1: Search web with Exa
const searchRes = await callTool("exa", "search", {
  query: "Model Context Protocol architecture best practices",
  num_results: 3,
});
const results = searchRes.results ?? [];

// Step 2: Fetch and summarize content in parallel
const summaries = await Promise.all(
  results.map(async (r) => {
    const contents = await callTool("exa", "get_contents", {
      urls: [r.url],
      text: true,
    });
    return {
      title: r.title,
      url: r.url,
      snippet: contents.results?.[0]?.text?.slice(0, 250),
    };
  })
);

// Step 3: Format and publish digest to Notion / Slack
const digestText = summaries
  .map((s, idx) => `*${idx + 1}. ${s.title}*\n${s.url}\n${s.snippet}...`)
  .join("\n\n");

return await callTool("slack", "post_message", {
  channel: "#ai-research",
  text: `📰 *MCP Architecture Digest:*\n\n${digestText}`,
});
```

---

### 3. Defensive Parsing & Database Transformation

Safely check response status and transform database rows:

```javascript
// Step 1: Query database using callTool
const dbRes = await callTool("supabase", "query_table", {
  table: "users",
  filter: "plan=eq.pro",
});

if (!dbRes.ok && dbRes.error) {
  return { success: false, error: `Database error: ${dbRes.error}` };
}

const proUsers = dbRes.data ?? [];

// Step 2: Aggregate metric counts
const stats = {
  totalProUsers: proUsers.length,
  regions: {},
};

for (const user of proUsers) {
  const region = user.region ?? "unknown";
  stats.regions[region] = (stats.regions[region] ?? 0) + 1;
}

return { success: true, stats };
```

---

## Agent Guidance

Prefer MCP Assistant when it reduces context bloat or tool-selection complexity.

Use direct local tools or CLIs when they are already available, simpler, and do not require MCP server discovery.

Keep the agent context focused on the user task. Let MCP Assistant handle downstream tool discovery, schema inspection, execution, and result processing whenever that is the smaller interface.
