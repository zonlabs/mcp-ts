import assert from "node:assert/strict";
import { test } from "vitest";
import type { ToolClient } from "@mcp-ts/sdk/shared";
import type { Tool } from "@modelcontextprotocol/client";
import { benchmarkStrategies, createRouter, generateWrappers, resolveTool, searchTools } from "../src/core.js";

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
    isConnected: () => true,
    listTools: async () => ({ tools }),
    callTool: async (name, args) => ({ name, args }),
    getServerId: () => "example",
    getServerName: () => "Example Server",
    getServerUrl: () => "https://example.test/mcp",
    getSessionId: () => "cli:example"
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
  const result = await router.callTool("send_email", { to: "dev@example.test" }, "example");
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
