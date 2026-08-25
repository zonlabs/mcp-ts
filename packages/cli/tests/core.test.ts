import assert from "node:assert/strict";
import { expect, test, vi } from "vitest";
import type { ToolClient } from "@mcp-ts/tool-router";
import type { Tool } from "@modelcontextprotocol/client";
import { benchmarkStrategies, createRouter, generateWrappers, resolveTool, searchTools } from "../src/core.js";
import { parseDiscoveryMode } from "../src/cli.js";

const tools: Tool[] = [
  {
    name: "send_email",
    description: "Send an email message",
    inputSchema: {
      type: "object",
      properties: {
        to: { type: "string" },
        subject: { type: "string" },
        urgent: { type: "boolean" }
      },
      required: ["to", "subject"]
    },
    outputSchema: {
      type: "object",
      properties: { messageId: { type: "string" } },
      required: ["messageId"]
    }
  },
  {
    name: "list_events",
    description: "List calendar events",
    inputSchema: { type: "object", properties: { date: { type: "string" } } }
  }
];

function fakeClient(): ToolClient {
  return {
    listTools: async () => ({ tools }),
    callTool: async (name, args) => ({ name, args }),
    getServerId: () => "example",
    getServerName: () => "Example Server",
    getServerUrl: () => "https://example.test/mcp",
  };
}

test("searches the catalog and reports schema token estimates", async () => {
  const router = await createRouter(fakeClient());
  const results = await searchTools(router, "email message", 5);
  assert.equal(results[0].name, "send_email");
  assert.equal(results[0].serverId, "example");
  assert.ok(results[0].estimatedTokens > 0);
  assert.equal(resolveTool(router, "example::send_email")?.name, "send_email");
});

test("routes an explicit tool call to the connected client", async () => {
  const router = await createRouter(fakeClient());
  const result = await router.callTool({
    toolId: "example::send_email",
    args: { to: "dev@example.test" },
  });
  assert.deepEqual(result, {
    name: "send_email",
    args: { to: "dev@example.test" }
  });
});

test("benchmarks all ToolRouter exposure strategies", async () => {
  const results = await benchmarkStrategies(fakeClient());
  assert.deepEqual(results.map((result) => result.strategy), ["all", "search", "groups"]);
  assert.equal(results[0].exposedTools, 2);
  assert.ok(results[1].exposedTools > 0);
  assert.equal(results[2].exposedTools, 2);
  assert.ok(results.every((result) => result.estimatedTokens > 0));
});

test("generates typed wrappers from tool schemas", () => {
  const generated = generateWrappers([
    ...tools,
    { name: "constructor", inputSchema: { type: "object" } },
    { name: "call_tool", inputSchema: { type: "object" } }
  ]);
  assert.match(generated, /export type SendEmailInput = \{ "to": string; "subject": string; "urgent"\?: boolean; \};/);
  assert.match(generated, /export type SendEmailOutput = \{ "messageId": string; \};/);
  assert.match(generated, /async sendEmail\(input: SendEmailInput\): Promise<SendEmailOutput>/);
  assert.match(generated, /this\.callTool\("send_email", input\)/);
  assert.match(generated, /async constructor2\(/);
  assert.match(generated, /async callTool2\(/);
});

test("renders banner, tree formatters and reports version", async () => {
  const { renderBanner, CLI_VERSION, treeNote, treeSummary } = await import("../src/ux.js");
  const banner = renderBanner();
  assert.ok(banner.includes("███╗"));
  assert.ok(banner.includes(CLI_VERSION));
  assert.ok(banner.includes("https://mcp-assistant.in"));

  const { runCli } = await import("../src/cli.js");
  let output = "";
  const code = await runCli(["--version"], {
    input: process.stdin,
    output: { write: (s: string) => { output += s; return true; } } as any,
    error: process.stderr,
  });
  assert.equal(code, 0);
  assert.ok(output.includes(CLI_VERSION));

  let helpOutput = "";
  const helpCode = await runCli(["--help"], {
    input: process.stdin,
    output: { write: (s: string) => { helpOutput += s; return true; } } as any,
    error: process.stderr,
  });
  assert.equal(helpCode, 0);
  assert.ok(helpOutput.includes("mcpa call"));
  assert.ok(helpOutput.includes("Execute an MCP tool through the gateway"));
  assert.ok(helpOutput.includes("mcpa search"));
  assert.ok(helpOutput.includes("mcpa schema"));
  assert.ok(helpOutput.includes("mcpa list"));
  assert.ok(helpOutput.includes("--mode"));
  assert.ok(!helpOutput.includes("all|search|auto"));
  assert.ok(!helpOutput.includes("--detached"));
});

test("does not export the obsolete bridge-owning one-shot context", async () => {
  const publicApi = await import("../src/index.js");
  assert.equal("withMcpGateway" in publicApi, false);
});

test("accepts only deterministic discovery modes", () => {
  assert.equal(parseDiscoveryMode(undefined), undefined);
  assert.equal(parseDiscoveryMode("search"), "search");
  assert.equal(parseDiscoveryMode("all"), "all");
  assert.throws(() => parseDiscoveryMode("auto"), /--mode must be "search" or "all"/);
});

test("correctly parses search_mcp_tools payload with camelCase toolName and serverId", async () => {
  const metaClient: ToolClient = {
    listTools: async () => ({
      tools: [
        {
          name: "search_mcp_tools",
          description: "Search MCP Tools",
          inputSchema: { type: "object" },
        },
      ],
    }),
    callTool: async (nameOrReq: any) => {
      const toolName = typeof nameOrReq === "string" ? nameOrReq : nameOrReq.name;
      if (toolName === "search_mcp_tools") {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                tools: [
                  {
                    serverId: "3a0zk9sliokm",
                    toolName: "add_reply_to_pull_request_comment",
                    title: "add_reply_to_pull_request_comment",
                    serverName: "GitHub",
                    description: "Add a reply to a PR comment",
                  },
                ],
              }),
            },
          ],
        };
      }
      return {};
    },
    getServerId: () => "remote",
    getServerName: () => "Remote Server",
  };

  const router = await createRouter(metaClient);
  const results = await searchTools(router, "reply", 5);
  assert.equal(results.length, 1);
  assert.equal(results[0].name, "add_reply_to_pull_request_comment");
  assert.equal(results[0].toolName, "add_reply_to_pull_request_comment");
  assert.equal(results[0].serverId, "3a0zk9sliokm");
  assert.equal(results[0].toolId, "3a0zk9sliokm::add_reply_to_pull_request_comment");
});

test("propagates a selected gateway meta-search failure without router fallback", async () => {
  const metaClient: ToolClient = {
    listTools: async () => ({
      tools: [{ name: "search_mcp_tools", inputSchema: { type: "object" } }],
    }),
    callTool: async () => {
      throw new Error("catalog offline");
    },
    getServerId: () => "remote",
    getServerName: () => "Remote Server",
  };

  const router = await createRouter(metaClient);
  await assert.rejects(searchTools(router, "issue", 5), /catalog offline/);
});

test("uses the router index when only legacy search_tools is exposed", async () => {
  const routerSearch = vi.fn(async () => []);
  const callTool = vi.fn(async () => {
    throw new Error("legacy search_tools must not be called");
  });
  const router = {
    getToolSchemas: vi.fn(({ toolIds }: { toolIds: string[] }) =>
      toolIds[0] === "remote::search_tools"
        ? [{ toolId: "remote::search_tools", toolName: "search_tools" }]
        : [],
    ),
    callTool,
    searchTools: routerSearch,
  } as never;

  await searchTools(router, "legacy", 5);

  expect(routerSearch).toHaveBeenCalledWith({ query: "legacy", limit: 5 });
  expect(routerSearch).toHaveBeenCalledTimes(1);
  expect(callTool).not.toHaveBeenCalled();
});

test("propagates invalid JSON from a selected gateway meta-search", async () => {
  const metaClient: ToolClient = {
    listTools: async () => ({
      tools: [{ name: "search_mcp_tools", inputSchema: { type: "object" } }],
    }),
    callTool: async () => ({ content: [{ type: "text", text: "not json" }] }),
    getServerId: () => "remote",
    getServerName: () => "Remote Server",
  };

  const router = await createRouter(metaClient);
  await assert.rejects(searchTools(router, "issue", 5), /valid JSON/);
});

test("propagates an error envelope from a selected gateway meta-search", async () => {
  const metaClient: ToolClient = {
    listTools: async () => ({
      tools: [{ name: "search_mcp_tools", inputSchema: { type: "object" } }],
    }),
    callTool: async () => ({
      isError: true,
      content: [{ type: "text", text: "catalog offline" }],
    }),
    getServerId: () => "remote",
    getServerName: () => "Remote Server",
  };

  const router = await createRouter(metaClient);
  await assert.rejects(searchTools(router, "issue", 5), /catalog offline/);
});

test("rejects missing text from a selected gateway meta-search", async () => {
  const metaClient: ToolClient = {
    listTools: async () => ({
      tools: [{ name: "search_mcp_tools", inputSchema: { type: "object" } }],
    }),
    callTool: async () => ({ content: [] }),
    getServerId: () => "remote",
    getServerName: () => "Remote Server",
  };

  const router = await createRouter(metaClient);
  await assert.rejects(searchTools(router, "issue", 5), /text content/);
});

test("parseToolRef handles double-colon, single-colon and plain names", async () => {
  const { parseToolRef } = await import("../src/core.js");
  assert.deepEqual(parseToolRef("3a0zk9sliokm::add_reply_to_pull_request_comment"), {
    serverId: "3a0zk9sliokm",
    toolName: "add_reply_to_pull_request_comment",
  });
  assert.deepEqual(parseToolRef("github:create_issue"), {
    serverId: "github",
    toolName: "create_issue",
  });
  assert.deepEqual(parseToolRef("plain_tool"), {
    toolName: "plain_tool",
  });
});


