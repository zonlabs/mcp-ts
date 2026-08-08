import assert from "node:assert/strict";
import test from "node:test";
import { createCodeModeRuntime } from "../dist/index.js";

test("executor runtime exposes tools as provider namespaces and records calls", async () => {
  const executorCalls = [];
  const executor = {
    async execute(code, providers) {
      executorCalls.push({ code, providers });
      const github = providers.find((provider) => provider.name === "github");
      const result = await github.fns.search_issues({ q: "bug" });
      return { result: { count: result.items.length }, logs: ["ran"] };
    },
  };

  const runtime = await createCodeModeRuntime({
    runtime: "executor",
    executor,
    servers: [
      {
        serverId: "github",
        serverName: "GitHub",
        listTools: async () => ({
          tools: [
            {
              name: "search_issues",
              description: "Search issues",
              inputSchema: { type: "object", properties: { q: { type: "string" } }, required: ["q"] },
            },
          ],
        }),
        callTool: async (_name, args) => ({ items: [{ title: args.q }] }),
      },
    ],
  });

  const result = await runtime.run("return await github.search_issues({ q: 'bug' })");

  assert.equal(result.error, undefined);
  assert.deepEqual(result.value, { count: 1 });
  assert.equal(result.logs.length, 1);
  assert.equal(result.toolCalls.length, 1);
  assert.equal(result.toolCalls[0].serverId, "github");
  assert.equal(result.toolCalls[0].toolName, "search_issues");
  assert.equal(result.toolCalls[0].ok, true);
  assert.match(executorCalls[0].code, /github/);
});

test("executor runtime reports executor errors without throwing", async () => {
  const runtime = await createCodeModeRuntime({
    runtime: "executor",
    executor: {
      async execute() {
        return { result: null, error: "sandbox failed", logs: [] };
      },
    },
    servers: [],
  });

  const result = await runtime.run("return 1");

  assert.equal(result.value, undefined);
  assert.equal(result.error.code, "SANDBOX_ERROR");
  assert.match(result.error.message, /sandbox failed/);
});
