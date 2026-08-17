import { z } from "zod";

export const DEFAULT_MCP_TOOL_SEARCH_LIMIT = 5;

export const listServersToolDefinition = {
  title: "List MCP Servers",
  description: "List connected MCP servers and indexed tool counts.",
  inputSchema: z.object({
    query: z.string().optional().describe("Optional server ID or name filter."),
  }),
  annotations: { title: "List MCP Servers", readOnlyHint: true, openWorldHint: false },
  _meta: { tags: ["read"] },
};

export const searchToolsToolDefinition = {
  title: "Search MCP Tools",
  description: "Search connected MCP tools without loading every schema into context.",
  inputSchema: z.object({
    query: z.string().describe("Natural-language or exact-name tool search query."),
    limit: z
      .number()
      .optional()
      .describe(`Maximum results to return. Defaults to ${DEFAULT_MCP_TOOL_SEARCH_LIMIT}.`),
    detail: z.enum(["brief", "detailed", "full"]).optional().describe("Response detail level."),
  }),
  annotations: { title: "Search MCP Tools", readOnlyHint: true, openWorldHint: false },
  _meta: { tags: ["read"] },
};

export const getToolSchemasToolDefinition = {
  title: "Get MCP Tool Schemas",
  description: "Get input and output schema details for discovered tools before calling them.",
  inputSchema: z.object({
    toolIds: z
      .array(z.string())
      .describe(
        "Canonical tool IDs returned by search_mcp_tools (e.g. ['serverId::toolName'])."
      ),
    detail: z.enum(["brief", "detailed", "full"]).optional().describe("Response detail level."),
  }),
  annotations: { title: "Get MCP Tool Schemas", readOnlyHint: true, openWorldHint: false },
  _meta: { tags: ["read"] },
};

export const callToolToolDefinition = {
  title: "Call MCP Tool",
  description: "Proxy execution to a discovered tool on the correct server.",
  inputSchema: z.object({
    toolId: z
      .string()
      .optional()
      .describe(
        "Canonical tool ID returned by search_mcp_tools (e.g. 'serverId::toolName')."
      ),
    args: z
      .record(z.string(), z.unknown())
      .optional()
      .describe("Arguments matching the tool input schema."),
    server_id: z.string().optional().describe("Legacy server ID."),
    tool_name: z.string().optional().describe("Legacy tool name."),
    arguments: z.record(z.string(), z.unknown()).optional().describe("Legacy arguments."),
  }),
  annotations: { title: "Call MCP Tool", readOnlyHint: false, openWorldHint: true },
  _meta: { tags: ["execute"] },
};

export const codemodeRunToolDefinition = {
  title: "Run CodeMode Script",
  description:
    "Execute a JavaScript/TypeScript-like script in the CodeMode sandbox " +
    "with connected MCP tool servers. No queue, workflow, or schedule required. " +
    "Use this when `search_mcp_tools` or `get_mcp_tool_schemas` identified an MCP tool, or when any equivalent MCP tool-discovery and schema-inspection tools identified one, and you want to inspect its output or validate its schema usage quickly without creating a saved workflow. " +
    "This is also the right tool for chaining multiple MCP tool calls in one script, avoiding repeated agent loops and context reduction, handling batch processing, or transforming, filtering, or summarizing large tool call results before returning them. " +
    "Recommended flow: First search for the right MCP tool with `search_mcp_tools`. Then inspect that tool's schema with `get_mcp_tool_schemas`, or use any equivalent search/schema tools provided by the current MCP client. Finally execute the real MCP call from this script once the args match the schema. " +
    "When using `callTool(serverId, toolName, args)` or namespaced helpers, the sandbox returns the normalized tool result directly. Use raw helpers only when you explicitly need the MCP envelope. " +
    "\n" +
    "## Prerequisites\n" +
    "- Use `search_mcp_tools` then `get_mcp_tool_schemas` to discover valid tool names, server IDs, and argument schemas.\n" +
    "- NEVER guess tool names or argument shapes — inspect schemas first.\n" +
    "- NEVER hardcode data values — load everything from tool responses.\n" +
    "- ALWAYS check `.ok` before using a tool result.\n" +
    "\n" +
    "## Plan & Batch\n" +
    "Before writing the script, categorize your calls:\n" +
    "- **Independent** (no dependency) → batch with `Promise.all` in one script.\n" +
    "- **Dependent** (B needs A's result) → chain sequentially in one script.\n" +
    "- **Exploratory** (next step depends on inspection) → separate call.\n" +
    "Prefer one script per task. Each `codemode_run` call spins up a new sandbox.\n" +
    "\n" +
    "## Patterns\n" +
    "✅ Namespaced: const r = await s1.toolName(args);\n" +
    "✅ Raw callTool: const r = await callTool(\"s1\", \"toolName\", args);\n" +
    "✅ Batch: const [a, b] = await Promise.all([s1.fn1(), s2.fn2()]);\n" +
    "✅ Chain: const u = await s1.get_user(e); await s2.send_msg(u.id);\n" +
    "✅ Bulk: iterate in batches of 5: await Promise.all(batch.map(s1.fn));\n" +
    "✅ Exploratory: first call searches, inspect, second call acts.\n" +
    "❌ Multiple `codemode_run` calls for steps that fit in one script.\n" +
    "\n" +
    "## Defensive Parsing\n" +
    "Always check `.ok` before using a result, and unwrap safely:\n" +
    "  const res = await s1.search_issues({ q });\n" +
    "  if (!res.ok) return { error: `Failed: ${res.error}` };\n" +
    "  const items = res.items ?? [];\n" +
    "\n" +
    "## Response\n" +
    "Returns `{ success, value, error, toolCalls, durationMs }`. " +
    "Each `toolCall` has `{ serverId, toolName, ok, error? }`. " +
    "Process small results inline. For large data, summarize/filter before returning.\n" +
    "\n" +
    "## Timeout\n" +
    "Default: 240s (4 min). For long multi-step workflows, save progress by returning intermediate state between calls.",
  inputSchema: z.object({
    script: z.string().describe("Code to execute inside CodeMode runtime."),
    input: z
      .record(z.string(), z.any())
      .optional()
      .describe("Optional object exposed as `input` in the sandbox."),
    timeout_ms: z
      .number()
      .optional()
      .describe("Optional execution timeout in milliseconds."),
    return_mode: z
      .enum(["final", "debug"])
      .optional()
      .describe("Defaults to final. Use debug to also include logs."),
  }),
  annotations: {
    title: "Run CodeMode Script",
    readOnlyHint: false,
    destructiveHint: false,
    openWorldHint: true,
  },
  _meta: {
    tags: ["execute"],
  },
};
