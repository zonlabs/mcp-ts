import assert from "node:assert/strict";
import { test } from "vitest";
import {
  createToolRouter,
  createToolServer
} from "../dist/index.js";

function fakeServer(id: string, tools: any[]) {
  const calls: any[] = [];
  return {
    calls,
    server: createToolServer({
      id,
      name: id,
      listTools: async () => ({ tools }),
      callTool: async (name: string, args: any) => {
        calls.push({ name, args });
        return { server: id, name, args };
      }
    })
  };
}

test("searches tools without exposing full schemas", async () => {
  const github = fakeServer("github", [
    {
      name: "list_pull_requests",
      description: "List GitHub pull requests for a repository",
      inputSchema: { type: "object", properties: { repo: { type: "string" } } }
    },
    {
      name: "create_issue",
      description: "Create a GitHub issue",
      annotations: { destructiveHint: true },
      inputSchema: { type: "object", properties: { title: { type: "string" } } }
    }
  ]);
  const slack = fakeServer("slack", [
    {
      name: "send_message",
      description: "Send a Slack channel message",
      inputSchema: { type: "object", properties: { channel: { type: "string" } } }
    }
  ]);

  const router = await createToolRouter({ servers: [github.server, slack.server] });
  const results = await router.searchTools({ query: "github pull requests" });

  assert.equal(results[0].toolId, "github::list_pull_requests");
  assert.equal(results[0].serverId, "github");
  assert.equal(results[0].toolName, "list_pull_requests");
  assert.equal((results[0] as any).inputSchema, undefined);
});

test("returns schemas and proxies calls to the selected server", async () => {
  const github = fakeServer("github", [
    {
      name: "get_issue",
      description: "Get GitHub issue",
      inputSchema: { type: "object", required: ["issue_number"] },
      outputSchema: {
        type: "object",
        properties: {
          issue: {
            type: "object",
            properties: {
              number: { type: "number" }
            },
            required: ["number"]
          }
        },
        required: ["issue"]
      }
    }
  ]);

  const router = await createToolRouter({ servers: [github.server] });
  const [schema] = router.getToolSchemas({ toolIds: ["github::get_issue"] });
  const result = await router.callTool({
    toolId: "github::get_issue",
    args: { issue_number: 7 }
  });

  assert.equal(schema.toolId, "github::get_issue");
  assert.deepEqual(schema.inputSchema, { type: "object", required: ["issue_number"] });
  assert.deepEqual(schema.outputSchema, {
    type: "object",
    properties: {
      issue: {
        type: "object",
        properties: {
          number: { type: "number" }
        },
        required: ["number"]
      }
    },
    required: ["issue"]
  });
  assert.deepEqual(result, {
    server: "github",
    name: "get_issue",
    args: { issue_number: 7 }
  });
  assert.deepEqual(github.calls, [{ name: "get_issue", args: { issue_number: 7 } }]);
});

test("exposes meta tools for search, schema lookup, and proxy execution", async () => {
  const github = fakeServer("github", [
    {
      name: "list_pull_requests",
      description: "List GitHub pull requests",
      inputSchema: { type: "object", properties: { state: { type: "string" } } }
    }
  ]);
  const router = await createToolRouter({ servers: [github.server] });
  const metaTools = router.getMetaTools();
  const names = metaTools.map((tool) => tool.name);

  assert.deepEqual(names, [
    "search_tools",
    "list_servers",
    "get_tool_schemas",
    "call_tool"
  ]);

  const search = await router.executeMetaTool("search_tools", {
    query: "pull requests"
  });
  assert.equal(search.isError, false);
  assert.match(search.content[0].text, /list_pull_requests/);
  assert.match(search.content[0].text, /Server ID: github/);
  assert.match(search.content[0].text, /Server Name: github/);
  assert.deepEqual((search.structuredContent as any).results.map((tool: any) => tool.toolId), [
    "github::list_pull_requests"
  ]);

  const schema = await router.executeMetaTool("get_tool_schemas", {
    toolIds: ["github::list_pull_requests"]
  });
  assert.equal(schema.isError, false);
  assert.match(schema.content[0].text, /Parameters/);
  assert.match(schema.content[0].text, /Server ID: github/);
  assert.match(schema.content[0].text, /Server Name: github/);
  assert.deepEqual((schema.structuredContent as any).results.map((tool: any) => tool.toolId), [
    "github::list_pull_requests"
  ]);

  const call = await router.executeMetaTool("call_tool", {
    toolId: "github::list_pull_requests",
    args: { state: "open" }
  });
  assert.equal(call.isError, false);
  assert.match(call.content[0].text, /open/);
  assert.deepEqual((call.structuredContent as any).result, {
    server: "github",
    name: "list_pull_requests",
    args: { state: "open" }
  });
});

test("meta-tool execution is available as an isolated executor", async () => {
  const {
    DEFAULT_TOOLROUTER_META_TOOL_NAMES,
    executeMetaTool
  } = await import("../dist/index.js");

  assert.equal(typeof executeMetaTool, "function");

  const result = await executeMetaTool(
    {
      metaToolNames: DEFAULT_TOOLROUTER_META_TOOL_NAMES,
      searchTools: async (request) => [
        {
          toolId: "github::get_issue",
          serverId: "github",
          serverName: "github",
          toolName: "get_issue",
          description: `query=${request.query}`,
          score: 1
        }
      ],
      listServers: () => [],
      getToolSchemas: () => [],
      callTool: async () => ({ ok: true })
    },
    "search_tools",
    { query: "issue" }
  );

  assert.equal(result.isError, false);
  assert.match(result.content[0].text, /github::get_issue/);
  assert.match(result.content[0].text, /Server ID: github/);
  assert.match(result.content[0].text, /Server Name: github/);
  assert.deepEqual((result.structuredContent as any).results.map((tool: any) => tool.toolId), [
    "github::get_issue"
  ]);
});

test("enforces destructive tool approval policy", async () => {
  const github = fakeServer("github", [
    {
      name: "delete_issue",
      description: "Delete GitHub issue",
      annotations: { destructiveHint: true },
      inputSchema: { type: "object" }
    }
  ]);
  const router = await createToolRouter({
    servers: [github.server],
    policy: { denyDestructiveTools: true }
  });

  await assert.rejects(
    router.callTool({ toolId: "github::delete_issue", args: {} }),
    /Policy denied/
  );
  assert.equal(github.calls.length, 0);
});

test("normalizes server ids consistently during search", async () => {
  const github = fakeServer("GitHub Server", [
    {
      name: "list_pull_requests",
      description: "List GitHub pull requests"
    }
  ]);

  const router = await createToolRouter({ servers: [github.server] });
  const results = await router.searchTools({
    serverId: "GitHub Server",
    query: "pull requests"
  });

  assert.equal(results.length, 1);
  assert.equal(results[0].serverId, "github_server");
});

test("initializes schema lookup when using the async meta-tool path", async () => {
  const github = fakeServer("github", [
    {
      name: "get_issue",
      description: "Get GitHub issue",
      inputSchema: { type: "object", required: ["issue_number"] }
    }
  ]);

  const { ToolRouter } = await import("../dist/index.js");
  const router = new ToolRouter({ servers: [github.server] });
  const schema = await router.executeMetaTool("get_tool_schemas", {
    toolIds: ["github::get_issue"]
  });

  assert.equal(schema.isError, false);
  assert.match(schema.content[0].text, /issue_number/);
});

test("shares one initialization across concurrent first-use calls", async () => {
  let listCalls = 0;
  let releaseList: (() => void) | undefined;
  const listed = new Promise((resolve) => {
    releaseList = resolve as any;
  });

  const server = createToolServer({
    id: "github",
    name: "github",
    listTools: async () => {
      listCalls += 1;
      await listed;
      return {
        tools: [{ name: "get_issue", description: "Get GitHub issue" }]
      };
    },
    callTool: async (name: string, args: any) => ({ name, args })
  });

  const { ToolRouter } = await import("../dist/index.js");
  const router = new ToolRouter({ servers: [server] });

  const searchPromise = router.searchTools({ query: "issue" });
  const callPromise = router.callTool({ toolId: "github::get_issue", args: {} });

  releaseList!();

  const [results, call] = await Promise.all([searchPromise, callPromise]);
  assert.equal(listCalls, 1);
  assert.equal(results[0].toolName, "get_issue");
  assert.deepEqual(call, { name: "get_issue", args: {} });
});

test("refresh invalidates ai-sdk adapter tool cache", async () => {
  let phase = 1;
  const client = {
    async listTools() {
      if (phase === 1) {
        return {
          tools: [{ name: "get_issue", description: "Get GitHub issue" }]
        };
      }
      return {
        tools: [{ name: "list_pull_requests", description: "List pull requests" }]
      };
    },
    async tools() {
      if (phase === 1) {
        return {
          get_issue: {
            execute: async (args: any) => ({ tool: "get_issue", args })
          }
        };
      }
      return {
        list_pull_requests: {
          execute: async (args: any) => ({ tool: "list_pull_requests", args })
        }
      };
    }
  };

  const { ToolRouter, mcpServer } = await import("../dist/index.js");
  const router = new ToolRouter({
    servers: [mcpServer("github", client)]
  });

  await router.searchTools({ query: "issue" });
  await router.callTool({ toolId: "github::get_issue", args: { issue_number: 1 } });

  phase = 2;
  await router.refresh();

  const results = await router.searchTools({ query: "pull requests" });
  const call = await router.callTool({
    toolId: "github::list_pull_requests",
    args: { state: "open" }
  });

  assert.equal(results[0].toolName, "list_pull_requests");
  assert.deepEqual(call, {
    tool: "list_pull_requests",
    args: { state: "open" }
  });
});

test("concurrent refresh failures keep the last good catalog usable", async () => {
  let refreshCalls = 0;
  let failListTools = false;
  const server = createToolServer({
    id: "github",
    name: "github",
    listTools: async () => {
      if (failListTools) {
        throw new Error("catalog unavailable");
      }
      return {
        tools: [{ name: "get_issue", description: "Get GitHub issue" }]
      };
    },
    callTool: async (name: string, args: any) => ({ name, args }),
    refresh: async () => {
      refreshCalls += 1;
    }
  });

  const router = await createToolRouter({ servers: [server] });
  failListTools = true;

  const refreshResults = await Promise.allSettled([
    router.refresh(),
    router.refresh()
  ]);

  assert.equal(refreshCalls, 1);
  assert.equal(refreshResults[0].status, "rejected");
  assert.equal(refreshResults[1].status, "rejected");

  const searchResults = await router.searchTools({ query: "issue" });
  const callResult = await router.callTool({ toolId: "github::get_issue", args: { issue_number: 1 } });

  assert.equal(searchResults[0].toolId, "github::get_issue");
  assert.deepEqual(callResult, {
    name: "get_issue",
    args: { issue_number: 1 }
  });
});

test("mcpServer supports object-style callTool runtimes", async () => {
  const client = {
    request(payload: any) {
      return payload;
    },
    async listTools() {
      return {
        tools: [{ name: "web_search_exa", description: "Search the web" }]
      };
    },
    async callTool({ name, args }: { name: string; args: any }) {
      return this.request({ name, args });
    }
  };

  const { ToolRouter, mcpServer } = await import("../dist/index.js");
  const router = new ToolRouter({
    servers: [mcpServer("exa", client)],
    pinnedTools: ["web_search_exa"]
  });

  const tools = await import("../dist/index.js").then((mod) => mod.createAISDKTools(router));
  const result = await tools.web_search_exa.execute({ query: "richest billionaire in 2026" });

  assert.deepEqual(result, {
    name: "web_search_exa",
    args: { query: "richest billionaire in 2026" }
  });
});

test("rejects duplicate meta-tool names in configuration", async () => {
  const { ToolRouter } = await import("../dist/index.js");
  assert.throws(
    () => {
      new ToolRouter({
        servers: [],
        metaToolNames: {
          searchTools: "my_tool",
          callTool: "my_tool"
        }
      });
    },
    /duplicate names detected/
  );
});

test("rejects discovered tools that collide with active meta-tool names", async () => {
  const github = fakeServer("github", [
    {
      name: "search_tools",
      description: "A tool that collides with the default meta-tool"
    }
  ]);

  const { ToolRouter } = await import("../dist/index.js");
  const router = new ToolRouter({ servers: [github.server] });

  await assert.rejects(
    router.initialize(),
    /Tool collision: Server "github" exposes a tool named "search_tools" which conflicts/
  );
});

test("allows excluding meta-tools to resolve collisions", async () => {
  const github = fakeServer("github", [
    {
      name: "search_tools",
      description: "A tool that collides with the default meta-tool, but we exclude the meta-tool"
    }
  ]);

  const { ToolRouter } = await import("../dist/index.js");
  const router = new ToolRouter({
    servers: [github.server],
    excludeMetaTools: ["search_tools"]
  });

  await router.initialize();
  const results = await router.searchTools({ query: "search_tools" });
  assert.equal(results[0].toolName, "search_tools");
});

test("excludeTools removes bare-name matches from the catalog", async () => {
  const exa = fakeServer("exa", [
    { name: "web_search_exa", description: "Search the web" },
    { name: "deep_search_exa", description: "Run deep search" }
  ]);
  const grep = fakeServer("grep", [
    { name: "web_search_exa", description: "Another web search" }
  ]);

  const router = await createToolRouter({
    servers: [exa.server, grep.server],
    excludeTools: ["web_search_exa"]
  });

  const searchResults = await router.searchTools({ query: "search" });

  assert.equal(searchResults.find((tool) => tool.toolName === "web_search_exa"), undefined);
  assert.deepEqual(router.getVisibleTools().pinned, []);
  await assert.rejects(
    router.callTool({ toolId: "exa::web_search_exa", args: {} }),
    /was not found/
  );
});

test("excludeTools supports canonical ids without excluding same-name tools on other servers", async () => {
  const exa = fakeServer("exa", [
    { name: "web_search_exa", description: "Search the web" }
  ]);
  const grep = fakeServer("grep", [
    { name: "web_search_exa", description: "Grep search" }
  ]);

  const router = await createToolRouter({
    servers: [exa.server, grep.server],
    excludeTools: ["exa::web_search_exa"]
  });

  const searchResults = await router.searchTools({ query: "search" });

  assert.equal(searchResults.find((tool) => tool.toolId === "exa::web_search_exa"), undefined);
  assert.equal(
    searchResults.find((tool) => tool.toolId === "grep::web_search_exa")?.toolId,
    "grep::web_search_exa"
  );
});

test("pinned tools appear in getVisibleTools alongside meta-tools", async () => {
  const github = fakeServer("github", [
    { name: "help", description: "Get help" },
    { name: "status", description: "Get server status" },
    { name: "create_issue", description: "Create a GitHub issue" }
  ]);

  const router = await createToolRouter({
    servers: [github.server],
    pinnedTools: ["help", "status"]
  });

  const { pinned, metaTools } = router.getVisibleTools();
  assert.deepEqual(pinned.map((t) => t.toolName), ["help", "status"]);
  assert.equal(metaTools.length, 4);
});

test("pinned tools are excluded from search results", async () => {
  const github = fakeServer("github", [
    { name: "help", description: "Get help and documentation" },
    { name: "create_issue", description: "Create a GitHub issue" }
  ]);

  const router = await createToolRouter({
    servers: [github.server],
    pinnedTools: ["help"]
  });

  const results = await router.searchTools({ query: "help" });
  assert.equal(results.find((r) => r.toolName === "help"), undefined);
});

test("deferredTools stay searchable and callable but are omitted from visible tools", async () => {
  const github = fakeServer("github", [
    { name: "workflow_list", description: "List workflows" },
    { name: "codemode_search_mcp_tools", description: "Search connected MCP tools" }
  ]);

  const router = await createToolRouter({
    servers: [github.server],
    pinnedTools: ["codemode_search_mcp_tools"],
    deferredTools: ["workflow_list"]
  });

  const { pinned, metaTools } = router.getVisibleTools();
  const results = await router.searchTools({ query: "workflow_list" });
  const call = await router.callTool({ toolId: "github::workflow_list", args: {} });

  assert.deepEqual(pinned.map((tool) => tool.toolName), ["codemode_search_mcp_tools"]);
  assert.equal(metaTools.length, 4);
  assert.equal(results.find((tool) => tool.toolId === "github::workflow_list")?.toolId, "github::workflow_list");
  assert.deepEqual(call, { server: "github", name: "workflow_list", args: {} });
});

test("tool metadata can defer tools from visible tools without removing them from search", async () => {
  const github = fakeServer("github", [
    {
      name: "workflow_run",
      description: "Run a workflow",
      _meta: { toolRouter: { deferred: true } }
    },
    { name: "codemode_run", description: "Run codemode" }
  ]);

  const router = await createToolRouter({
    servers: [github.server],
    pinnedTools: ["codemode_run"]
  });

  const { pinned } = router.getVisibleTools();
  const results = await router.searchTools({ query: "workflow_run" });

  assert.deepEqual(pinned.map((tool) => tool.toolName), ["codemode_run"]);
  assert.equal(results.find((tool) => tool.toolId === "github::workflow_run")?.toolId, "github::workflow_run");
});

test("canonical pinned tool ids disambiguate duplicate tool names", async () => {
  const github = fakeServer("github", [
    { name: "status", description: "Get GitHub status" }
  ]);
  const slack = fakeServer("slack", [
    { name: "status", description: "Get Slack status" }
  ]);

  const router = await createToolRouter({
    servers: [github.server, slack.server],
    pinnedTools: ["slack::status"]
  });

  const { pinned } = router.getVisibleTools();
  const results = await router.searchTools({ query: "status" });

  assert.deepEqual(pinned.map((tool) => tool.toolId), ["slack::status"]);
  assert.equal(results.find((tool) => tool.toolId === "slack::status"), undefined);
  assert.equal(results.find((tool) => tool.toolId === "github::status")?.toolId, "github::status");
});

test("canonical pinned tool ids normalize the server id", async () => {
  const stable = fakeServer("u2tsgODpOrlF", [
    { name: "toolname", description: "Stable generated server id tool" }
  ]);

  const router = await createToolRouter({
    servers: [stable.server],
    pinnedTools: ["u2tsgODpOrlF::toolname"]
  });

  const { pinned } = router.getVisibleTools();
  const results = await router.searchTools({ query: "generated server id" });

  assert.deepEqual(pinned.map((tool) => tool.toolId), ["u2tsgodporlf::toolname"]);
  assert.equal(results.find((tool) => tool.toolId === "u2tsgodporlf::toolname"), undefined);
});

test("sync catalog methods require initialization when router is constructed directly", async () => {
  const github = fakeServer("github", [
    { name: "get_issue", description: "Get issue", inputSchema: { type: "object" } }
  ]);

  const { ToolRouter } = await import("../dist/index.js");
  const router = new ToolRouter({ servers: [github.server] });

  assert.throws(
    () => router.listServers(),
    /ToolRouter is not initialized/
  );
  assert.throws(
    () => router.getVisibleTools(),
    /ToolRouter is not initialized/
  );
  assert.throws(
    () => router.getToolSchemas({ toolIds: ["github::get_issue"] }),
    /ToolRouter is not initialized/
  );
});

test("pinned tools remain callable via callTool", async () => {
  const github = fakeServer("github", [
    { name: "help", description: "Get help" }
  ]);

  const router = await createToolRouter({
    servers: [github.server],
    pinnedTools: ["help"]
  });

  const result = await router.callTool({ toolId: "github::help", args: {} });
  assert.deepEqual(result, { server: "github", name: "help", args: {} });
});

test("unknown pinned tool names are silently omitted", async () => {
  const github = fakeServer("github", [
    { name: "create_issue", description: "Create issue" }
  ]);

  const router = await createToolRouter({
    servers: [github.server],
    pinnedTools: ["nonexistent_tool"]
  });

  const { pinned } = router.getVisibleTools();
  assert.equal(pinned.length, 0);
});

test("policy-denied tools are excluded from search results", async () => {
  const github = fakeServer("github", [
    { name: "delete_repo", description: "Delete a repository" },
    { name: "get_issue", description: "Get an issue" }
  ]);

  const router = await createToolRouter({
    servers: [github.server],
    policy: { denyTools: ["github::delete_repo"] }
  });

  const results = await router.searchTools({ query: "issue" });
  assert.equal(results.find((r) => r.toolName === "delete_repo"), undefined);
  assert.equal(results.find((r) => r.toolName === "get_issue")?.toolName, "get_issue");
});

test("policy-denied pinned tools are excluded from visible tools", async () => {
  const github = fakeServer("github", [
    { name: "delete_repo", description: "Delete a repository" },
    { name: "get_issue", description: "Get an issue" }
  ]);

  const router = await createToolRouter({
    servers: [github.server],
    pinnedTools: ["delete_repo", "get_issue"],
    policy: { denyTools: ["github::delete_repo"] }
  });

  const { pinned } = router.getVisibleTools();
  assert.deepEqual(pinned.map((tool) => tool.toolName), ["get_issue"]);
});

test("listServers uses normalized server ids without duplicates", async () => {
  const github = fakeServer("GitHub Server", [
    { name: "get_issue", description: "Get issue" }
  ]);

  const router = await createToolRouter({ servers: [github.server] });
  assert.deepEqual(router.listServers(), [
    {
      serverId: "github_server",
      serverName: "GitHub Server",
      toolCount: 1
    }
  ]);
});

test("pinned ai-sdk tools preserve annotations", async () => {
  const github = fakeServer("github", [
    {
      name: "delete_repo",
      description: "Delete a repository",
      annotations: { destructiveHint: true, title: "Delete Repository" }
    }
  ]);

  const { createAISDKTools } = await import("../dist/index.js");
  const router = await createToolRouter({
    servers: [github.server],
    pinnedTools: ["delete_repo"]
  });

  const tools = await createAISDKTools(router);
  assert.deepEqual(tools.delete_repo.annotations, {
    destructiveHint: true,
    title: "Delete Repository"
  });
});

test("search meta tool does not expose annotations", async () => {
  const github = fakeServer("github", [
    {
      name: "delete_repo",
      description: "Delete a repository",
      annotations: { destructiveHint: true, title: "Delete Repository" }
    }
  ]);

  const router = await createToolRouter({ servers: [github.server] });
  const search = await router.executeMetaTool("search_tools", { query: "delete" });

  assert.equal(search.isError, false);
  assert.doesNotMatch(search.content[0].text, /destructiveHint|Delete Repository/);
  assert.deepEqual((search.structuredContent as any).results.map((tool: any) => tool.toolId), ["github::delete_repo"]);
});

test("schema meta tool does not expose annotations", async () => {
  const github = fakeServer("github", [
    {
      name: "delete_repo",
      description: "Delete a repository",
      annotations: { destructiveHint: true, title: "Delete Repository" },
      inputSchema: { type: "object", properties: { repo: { type: "string" } } },
      outputSchema: {
        type: "object",
        properties: {
          deleted: { type: "boolean" }
        },
        required: ["deleted"]
      }
    }
  ]);

  const router = await createToolRouter({ servers: [github.server] });
  const schema = await router.executeMetaTool("get_tool_schemas", {
    toolIds: ["github::delete_repo"]
  });

  assert.equal(schema.isError, false);
  assert.match(schema.content[0].text, /Server ID: github/);
  assert.match(schema.content[0].text, /Server Name: github/);
  assert.match(schema.content[0].text, /Parameters/);
  assert.match(schema.content[0].text, /Returns/);
  assert.match(schema.content[0].text, /deleted/);
  assert.doesNotMatch(schema.content[0].text, /destructiveHint|Delete Repository/);
  assert.deepEqual((schema.structuredContent as any).results.map((tool: any) => tool.toolId), ["github::delete_repo"]);
  assert.deepEqual((schema.structuredContent as any).results[0].outputSchema, {
    type: "object",
    properties: {
      deleted: { type: "boolean" }
    },
    required: ["deleted"]
  });
});

test("search and schema meta tools include server id and server name in text responses", async () => {
  const server = createToolServer({
    id: "GitHub Server",
    name: "GitHub Server",
    listTools: async () => ({
      tools: [
        {
          name: "get_issue",
          description: "Get a GitHub issue",
          inputSchema: { type: "object", properties: { issue_number: { type: "number" } } }
        }
      ]
    }),
    callTool: async (name: string, args: any) => ({ name, args })
  });

  const router = await createToolRouter({ servers: [server] });
  const search = await router.executeMetaTool("search_tools", { query: "issue" });
  const schema = await router.executeMetaTool("get_tool_schemas", {
    toolIds: ["github_server::get_issue"]
  });

  assert.match(search.content[0].text, /Server ID: github_server/);
  assert.match(search.content[0].text, /Server Name: GitHub Server/);
  assert.match(schema.content[0].text, /Server ID: github_server/);
  assert.match(schema.content[0].text, /Server Name: GitHub Server/);
  assert.equal((search.structuredContent as any).results[0].serverId, "github_server");
  assert.equal((search.structuredContent as any).results[0].serverName, "GitHub Server");
  assert.equal((schema.structuredContent as any).results[0].serverId, "github_server");
  assert.equal((schema.structuredContent as any).results[0].serverName, "GitHub Server");
});

test("search results expose canonical tool ids", async () => {
  const github = fakeServer("github", [
    { name: "get_issue", description: "Get an issue" }
  ]);

  const router = await createToolRouter({ servers: [github.server] });
  const [result] = await router.searchTools({ query: "issue" });

  assert.equal(result.toolId, "github::get_issue");
});

test("getToolSchemas supports batch tool ids", async () => {
  const github = fakeServer("github", [
    { name: "get_issue", description: "Get issue", inputSchema: { type: "object" } },
    { name: "list_pull_requests", description: "List pull requests", inputSchema: { type: "object" } }
  ]);

  const router = await createToolRouter({ servers: [github.server] });
  const schemas = router.getToolSchemas({
    toolIds: ["github::get_issue", "github::list_pull_requests"]
  });

  assert.deepEqual(schemas.map((schema) => schema.toolId), [
    "github::get_issue",
    "github::list_pull_requests"
  ]);
});

test("supports parsing tool ids with double colon (::) separator", async () => {
  const github = fakeServer("github", [
    { name: "get_issue", description: "Get issue", inputSchema: { type: "object" } }
  ]);

  const router = await createToolRouter({
    servers: [github.server],
    pinnedTools: ["github::get_issue"],
    excludeTools: ["github::nonexistent_tool"]
  });

  // Test getToolSchemas with double colon
  const [schema] = router.getToolSchemas({
    toolIds: ["github::get_issue"]
  });
  assert.equal(schema.toolId, "github::get_issue");

  // Test callTool with double colon
  const callResult = await router.callTool({
    toolId: "github::get_issue",
    args: { issue_number: 42 }
  });
  assert.deepEqual(callResult, {
    server: "github",
    name: "get_issue",
    args: { issue_number: 42 }
  });

  // Test resolving pinned tool configured with double colon
  const { pinned } = router.getVisibleTools();
  assert.deepEqual(pinned.map((t) => t.toolName), ["get_issue"]);
});

