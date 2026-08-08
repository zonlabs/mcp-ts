import assert from "node:assert/strict";
import test from "node:test";
import { createCodeModeRuntime } from "../dist/index.js";

async function executeWithProviderGlobals(code, providers) {
  const names = providers.map((provider) => provider.name);
  const values = providers.map((provider) => provider.fns);
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const load = new AsyncFunction(...names, `return (${code});`);
  const fn = await load(...values);
  return fn();
}

test("executor runtime exposes tools as provider namespaces and records calls", async () => {
  const executorCalls = [];
  const executor = {
    async execute(code, providers) {
      executorCalls.push({ code, providers });
      const result = await executeWithProviderGlobals(code, providers);
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

test("executor runtime exposes sanitized namespace and tool aliases", async () => {
  const runtime = await createCodeModeRuntime({
    runtime: "executor",
    executor: {
      async execute(code, providers) {
        return {
          result: await executeWithProviderGlobals(code, providers),
          logs: [],
        };
      },
    },
    servers: [
      {
        serverId: "google-calendar",
        serverName: "Google Calendar",
        listTools: async () => ({
          tools: [
            {
              name: "list-events",
              description: "List events",
              inputSchema: { type: "object", properties: { calendarId: { type: "string" } } },
            },
          ],
        }),
        callTool: async (_name, args) => ({ calendarId: args.calendarId, events: ["standup"] }),
      },
    ],
  });

  const result = await runtime.run("return await google_calendar.list_events({ calendarId: 'primary' })");

  assert.equal(result.error, undefined);
  assert.deepEqual(result.value, { calendarId: "primary", events: ["standup"] });
  assert.equal(result.toolCalls.length, 1);
  assert.equal(result.toolCalls[0].serverId, "google-calendar");
  assert.equal(result.toolCalls[0].toolName, "list-events");
});

test("executor runtime exposes reserved server names through the servers map", async () => {
  const executorCalls = [];
  const runtime = await createCodeModeRuntime({
    runtime: "executor",
    executor: {
      async execute(code, providers) {
        executorCalls.push({ code, providers });
        return {
          result: await executeWithProviderGlobals(code, providers),
          logs: [],
        };
      },
    },
    servers: [
      {
        serverId: "default",
        serverName: "Reserved Server",
        listTools: async () => ({
          tools: [
            {
              name: "class",
              description: "Reserved tool",
              inputSchema: { type: "object", properties: { value: { type: "string" } } },
            },
          ],
        }),
        callTool: async (_name, args) => ({ value: args.value }),
      },
    ],
  });

  const result = await runtime.run("return await servers.default.class({ value: 'ok' })");

  assert.equal(result.error, undefined);
  assert.deepEqual(result.value, { value: "ok" });
  assert.equal(executorCalls[0].providers[0].name, "__mcp_server_0");
  assert.match(executorCalls[0].code, /servers\.default\.class/);
});

test("executor runtime restores global namespace aliases after execution", async () => {
  const previousGithub = globalThis.github;
  const hadGithub = Object.prototype.hasOwnProperty.call(globalThis, "github");

  const runtime = await createCodeModeRuntime({
    runtime: "executor",
    executor: {
      async execute(code, providers) {
        return {
          result: await executeWithProviderGlobals(code, providers),
          logs: [],
        };
      },
    },
    servers: [
      {
        serverId: "github",
        serverName: "GitHub",
        listTools: async () => ({
          tools: [
            {
              name: "search_issues",
              description: "Search issues",
              inputSchema: { type: "object", properties: { q: { type: "string" } } },
            },
          ],
        }),
        callTool: async (_name, args) => ({ items: [{ title: args.q }] }),
      },
    ],
  });

  const result = await runtime.run("return await github.search_issues({ q: 'leak-check' })");

  assert.equal(result.error, undefined);
  if (hadGithub) {
    assert.equal(globalThis.github, previousGithub);
  } else {
    assert.equal(Object.prototype.hasOwnProperty.call(globalThis, "github"), false);
  }
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

test("executor runtime enforces maxResultBytes", async () => {
  const runtime = await createCodeModeRuntime({
    runtime: "executor",
    executor: {
      async execute() {
        return { result: { text: "this result is too large" }, logs: [] };
      },
    },
    limits: { maxResultBytes: 8 },
    servers: [],
  });

  const result = await runtime.run("return { text: 'this result is too large' }");

  assert.equal(result.value, undefined);
  assert.equal(result.error.code, "RESULT_TOO_LARGE");
  assert.match(result.error.message, /maxResultBytes 8 exceeded/);
});
