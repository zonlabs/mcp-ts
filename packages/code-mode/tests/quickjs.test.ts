import assert from "node:assert/strict";
import { test } from "vitest";

const hasQuickJs = await import("quickjs-emscripten").then(
  () => true,
  () => false
);

function fakeSource(serverId = "github", tools: any = undefined) {
  const calls: any[] = [];
  return {
    calls,
    source: {
      serverId,
      serverName: serverId,
      listTools: async () => ({
        tools: tools ?? [
          {
            name: "get_issue",
            description: "Get a GitHub issue by number",
            inputSchema: {
              type: "object",
              properties: {
                issue_number: { type: "number", description: "Issue number" }
              },
              required: ["issue_number"]
            }
          },
          {
            name: "create_issue",
            description: "Create a new GitHub issue",
            inputSchema: {
              type: "object",
              properties: {
                title: { type: "string", description: "Issue title" },
                body: { type: "string", description: "Issue body" }
              },
              required: ["title"]
            }
          }
        ]
      }),
      callTool: async (name: string, args: any) => {
        calls.push({ name, args });
        return { name, args };
      }
    }
  };
}

function fakeExaSource() {
  const calls: any[] = [];
  return {
    calls,
    source: {
      serverId: "exa",
      serverName: "exa",
      listTools: async () => ({
        tools: [
          {
            name: "web_search",
            description: "Search the web for information",
            inputSchema: {
              type: "object",
              properties: {
                query: { type: "string", description: "Search query" }
              },
              required: ["query"]
            }
          }
        ]
      }),
      callTool: async (name: string, args: any) => {
        calls.push({ name, args });
        return { results: [{ title: "Result 1", url: "https://example.com" }] };
      }
    }
  };
}

function fakeMcpEnvelopeSource(serverId = "docs") {
  const calls: any[] = [];
  return {
    calls,
    source: {
      serverId,
      serverName: serverId,
      listTools: async () => ({
        tools: [
          {
            name: "structured_search",
            description: "Returns structuredContent",
            inputSchema: { type: "object", properties: { query: { type: "string" } } }
          },
          {
            name: "json_text_search",
            description: "Returns JSON text content",
            inputSchema: { type: "object", properties: { query: { type: "string" } } }
          },
          {
            name: "plain_text_search",
            description: "Returns plain text content",
            inputSchema: { type: "object", properties: { query: { type: "string" } } }
          },
          {
            name: "multipart_search",
            description: "Returns multipart content",
            inputSchema: { type: "object", properties: { query: { type: "string" } } }
          },
          {
            name: "error_single_text",
            description: "Returns isError with single text content",
            inputSchema: { type: "object", properties: { query: { type: "string" } } }
          },
          {
            name: "error_json_text",
            description: "Returns isError with JSON text content",
            inputSchema: { type: "object", properties: { query: { type: "string" } } }
          }
        ]
      }),
      callTool: async (name: string, args: any) => {
        calls.push({ name, args });
        if (name === "structured_search") {
          return {
            structuredContent: {
              items: [{ title: "Structured result" }]
            },
            content: [{ type: "text", text: "{\"ignored\":true}" }],
            isError: false
          };
        }
        if (name === "json_text_search") {
          return {
            content: [{ type: "text", text: JSON.stringify({ items: [{ title: "JSON text result" }] }) }],
            isError: false
          };
        }
        if (name === "plain_text_search") {
          return {
            content: [{ type: "text", text: "plain text result" }],
            isError: false
          };
        }
        if (name === "multipart_search") {
          return {
            content: [
              { type: "text", text: "first" },
              { type: "text", text: "second" }
            ],
            isError: true
          };
        }
        if (name === "error_single_text") {
          return {
            content: [{ type: "text", text: "resource not found" }],
            isError: true
          };
        }
        if (name === "error_json_text") {
          return {
            content: [{ type: "text", text: JSON.stringify({ error: "invalid input", code: 400 }) }],
            isError: true
          };
        }
        throw new Error(`Unknown tool ${name}`);
      }
    }
  };
}

const QUICKJS_RUNTIME = 'quickjs';

test("basic execution: 1 + 2 returns 3", { skip: !hasQuickJs }, async () => {
  const { createCodeModeRuntime } = await import("../dist/index.js");
  const { source } = fakeSource();
  const runtime = await createCodeModeRuntime({ servers: [source], runtime: QUICKJS_RUNTIME });

  const result = await runtime.run(`return await 1 + 2;`);

  assert.equal(result.error, undefined);
  assert.equal(result.value, 3);
});

test("namespace bridge: github.get_issue(args) works with await", { skip: !hasQuickJs }, async () => {
  const { createCodeModeRuntime } = await import("../dist/index.js");
  const { calls, source } = fakeSource();
  const runtime = await createCodeModeRuntime({ servers: [source], runtime: QUICKJS_RUNTIME });

  const result = await runtime.run(`
    var issue = await github.get_issue({ issue_number: 42 });
    return issue;
  `);

  assert.equal(result.error, undefined);
  assert.deepEqual(result.value, { name: "get_issue", args: { issue_number: 42 } });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, "get_issue");
});

test("callTool() escape hatch works with await", { skip: !hasQuickJs }, async () => {
  const { createCodeModeRuntime } = await import("../dist/index.js");
  const { calls, source } = fakeSource();
  const runtime = await createCodeModeRuntime({ servers: [source], runtime: QUICKJS_RUNTIME });

  const result = await runtime.run(`
    var issue = await callTool("github", "get_issue", { issue_number: 7 });
    return issue;
  `);

  assert.equal(result.error, undefined);
  assert.deepEqual(result.value, { name: "get_issue", args: { issue_number: 7 } });
  assert.equal(calls.length, 1);
});

test("input passthrough works", { skip: !hasQuickJs }, async () => {
  const { createCodeModeRuntime } = await import("../dist/index.js");
  const { source } = fakeSource();
  const runtime = await createCodeModeRuntime({ servers: [source], runtime: QUICKJS_RUNTIME });

  const result = await runtime.run(`
    return await ({ doubled: input.value * 2 });
  `, { value: 21 });

  assert.equal(result.error, undefined);
  assert.deepEqual(result.value, { doubled: 42 });
});

test("console output is captured", { skip: !hasQuickJs }, async () => {
  const { createCodeModeRuntime } = await import("../dist/index.js");
  const { source } = fakeSource();
  const runtime = await createCodeModeRuntime({ servers: [source], runtime: QUICKJS_RUNTIME });

  const result = await runtime.run(`
    console.log("hello");
    console.warn("caution");
    console.error("fail");
    return await "done";
  `);

  assert.equal(result.error, undefined);
  assert.equal(result.value, "done");
  assert.equal(result.logs.length, 3);
  assert.equal(result.logs[0].level, "log");
  assert.equal(result.logs[1].level, "warn");
  assert.equal(result.logs[2].level, "error");
});

test("tool calls are tracked in result", { skip: !hasQuickJs }, async () => {
  const { createCodeModeRuntime } = await import("../dist/index.js");
  const { source } = fakeSource();
  const runtime = await createCodeModeRuntime({ servers: [source], runtime: QUICKJS_RUNTIME });

  const result = await runtime.run(`
    await github.get_issue({ issue_number: 1 });
    await github.create_issue({ title: "test" });
    return await "done";
  `);

  assert.equal(result.error, undefined);
  assert.equal(result.toolCalls.length, 2);
  assert.equal(result.toolCalls[0].toolName, "get_issue");
  assert.equal(result.toolCalls[0].ok, true);
  assert.equal(result.toolCalls[1].toolName, "create_issue");
  assert.equal(result.toolCalls[1].ok, true);
});

test("searchTools() inside sandbox returns results", { skip: !hasQuickJs }, async () => {
  const { createCodeModeRuntime } = await import("../dist/index.js");
  const { source } = fakeSource();
  const runtime = await createCodeModeRuntime({ servers: [source], runtime: QUICKJS_RUNTIME });

  const result = await runtime.run(`
    var tools = await searchTools("issue");
    return tools.map(t => ({ serverId: t.serverId, toolName: t.toolName }));
  `);

  assert.equal(result.error, undefined);
  assert.ok(Array.isArray(result.value));
  assert.ok(result.value.length > 0);
  assert.equal(result.value[0].serverId, "github");
});

test("__interfaces contains TypeScript definitions", { skip: !hasQuickJs }, async () => {
  const { createCodeModeRuntime } = await import("../dist/index.js");
  const { source } = fakeSource();
  const runtime = await createCodeModeRuntime({ servers: [source], runtime: QUICKJS_RUNTIME });

  const result = await runtime.run(`return await __interfaces;`);

  assert.equal(result.error, undefined);
  assert.ok(typeof result.value === "string");
  assert.ok(result.value.includes("namespace github"));
  assert.ok(result.value.includes("get_issueInput"));
  assert.ok(result.value.includes("issue_number"));
});

test("__getToolInterface() returns specific tool interface", { skip: !hasQuickJs }, async () => {
  const { createCodeModeRuntime } = await import("../dist/index.js");
  const { source } = fakeSource();
  const runtime = await createCodeModeRuntime({ servers: [source], runtime: QUICKJS_RUNTIME });

  const result = await runtime.run(`
    var iface = await __getToolInterface("github.get_issue");
    return iface;
  `);

  assert.equal(result.error, undefined);
  assert.ok(typeof result.value === "string");
  assert.ok(result.value.includes("github.get_issue(args)"));
});

test("multi-source: github.get_issue() vs exa.web_search()", { skip: !hasQuickJs }, async () => {
  const { createCodeModeRuntime } = await import("../dist/index.js");
  const github = fakeSource();
  const exa = fakeExaSource();
  const runtime = await createCodeModeRuntime({ servers: [github.source, exa.source], runtime: QUICKJS_RUNTIME });

  const result = await runtime.run(`
    var issue = await github.get_issue({ issue_number: 1 });
    var search = await exa.web_search({ query: "hello" });
    return { issue, search };
  `);

  assert.equal(result.error, undefined);
  const val325 = result.value as any;
  assert.deepEqual(val325.issue, { name: "get_issue", args: { issue_number: 1 } });
  assert.deepEqual(val325.search, { results: [{ title: "Result 1", url: "https://example.com" }] });
  assert.equal(github.calls.length, 1);
  assert.equal(exa.calls.length, 1);
});

test("error handling: isError tool does not crash sandbox", { skip: !hasQuickJs }, async () => {
  const { createCodeModeRuntime } = await import("../dist/index.js");
  const { source } = fakeMcpEnvelopeSource();
  const runtime = await createCodeModeRuntime({ servers: [source], runtime: QUICKJS_RUNTIME });

  const result = await runtime.run(`
    try {
      var r = await callTool("docs", "error_single_text", { query: "x" });
      return ({ caught: r.isError ? true : false, error: r.isError ? (r.content || "unknown") : String(r) });
    } catch (e) {
      return ({ caught: true, error: String(e) });
    }
  `);

  assert.equal(result.error, undefined);
  assert.ok((result.value as any).caught, "sandbox should detect the error");
  assert.equal(result.toolCalls.length, 1);
  assert.equal(result.toolCalls[0].ok, false);
  assert.equal(result.toolCalls[0].error, "resource not found");
});

test("MCP envelopes are normalized to script-friendly values", { skip: !hasQuickJs }, async () => {
  const { createCodeModeRuntime } = await import("../dist/index.js");
  const { source } = fakeMcpEnvelopeSource();
  const runtime = await createCodeModeRuntime({ servers: [source], runtime: QUICKJS_RUNTIME });

  const result = await runtime.run(`
    return await ({
      structured: await docs.structured_search({ query: "a" }),
      jsonText: await callTool("docs", "json_text_search", { query: "b" }),
      plainText: await docs.plain_text_search({ query: "c" }),
      multipart: await callTool("docs", "multipart_search", { query: "d" })
    });
  `);

  assert.equal(result.error, undefined);
  const val368 = result.value as any;
  assert.deepEqual(val368.structured, {
    structuredContent: { items: [{ title: "Structured result" }] },
    content: [{ type: "text", text: JSON.stringify({ ignored: true }) }],
    isError: false
  });
  assert.deepEqual(val368.jsonText, {
    content: [{ type: "text", text: JSON.stringify({ items: [{ title: "JSON text result" }] }) }],
    isError: false
  });
  assert.deepEqual(val368.plainText, {
    content: [{ type: "text", text: "plain text result" }],
    isError: false
  });
  assert.deepEqual(val368.multipart, {
    content: [
      { type: "text", text: "first" },
      { type: "text", text: "second" }
    ],
    isError: true
  });
});

test("error envelope: single text content preserves isError", { skip: !hasQuickJs }, async () => {
  const { createCodeModeRuntime } = await import("../dist/index.js");
  const { source } = fakeMcpEnvelopeSource();
  const runtime = await createCodeModeRuntime({ servers: [source], runtime: QUICKJS_RUNTIME });

  const result = await runtime.run(`
    var r = await callTool("docs", "error_single_text", { query: "x" });
    return r;
  `);

  assert.equal(result.error, undefined);
  assert.ok(result.value !== null && typeof result.value === "object");
  assert.equal((result.value as any).isError, true);
});

test("error envelope: JSON text content is parsed and isError preserved", { skip: !hasQuickJs }, async () => {
  const { createCodeModeRuntime } = await import("../dist/index.js");
  const { source } = fakeMcpEnvelopeSource();
  const runtime = await createCodeModeRuntime({ servers: [source], runtime: QUICKJS_RUNTIME });

  const result = await runtime.run(`
    var r = await callTool("docs", "error_json_text", { query: "x" });
    return r;
  `);

  assert.equal(result.error, undefined);
  const val = result.value as any;
  assert.ok(val !== null && typeof val === "object");
  assert.equal(val.isError, true);
  assert.ok(Array.isArray(val.content));
  assert.equal(val.content[0].type, "text");
  assert.equal(val.content[0].text, JSON.stringify({ error: "invalid input", code: 400 }));
});

test("error envelope: toolCalls[].ok is false with error message", { skip: !hasQuickJs }, async () => {
  const { createCodeModeRuntime } = await import("../dist/index.js");
  const { source } = fakeMcpEnvelopeSource();
  const runtime = await createCodeModeRuntime({ servers: [source], runtime: QUICKJS_RUNTIME });

  const result = await runtime.run(`
    await callTool("docs", "error_single_text", { query: "x" });
    return await "done";
  `);

  assert.equal(result.error, undefined);
  assert.equal(result.value, "done");
  assert.equal(result.toolCalls.length, 1);
  assert.equal(result.toolCalls[0].ok, false);
  assert.equal(result.toolCalls[0].error, "resource not found");
  assert.equal(result.toolCalls[0].serverId, "docs");
  assert.equal(result.toolCalls[0].toolName, "error_single_text");
});

test("error envelope: successful and failed calls are both tracked", { skip: !hasQuickJs }, async () => {
  const { createCodeModeRuntime } = await import("../dist/index.js");
  const { source } = fakeMcpEnvelopeSource();
  const runtime = await createCodeModeRuntime({ servers: [source], runtime: QUICKJS_RUNTIME });

  const result = await runtime.run(`
    await docs.plain_text_search({ query: "ok" });
    await callTool("docs", "error_single_text", { query: "fail" });
    return await "done";
  `);

  assert.equal(result.error, undefined);
  assert.equal(result.value, "done");
  assert.equal(result.toolCalls.length, 2);
  assert.equal(result.toolCalls[0].ok, true);
  assert.equal(result.toolCalls[1].ok, false);
  assert.equal(result.toolCalls[1].error, "resource not found");
});

test("auto-detect runtime when no runtime option specified", { skip: !hasQuickJs }, async () => {
  const { createCodeModeRuntime } = await import("../dist/index.js");
  const { source } = fakeSource();
  const runtime = await createCodeModeRuntime({ servers: [source] });

  const result = await runtime.run(`return await 1 + 2;`);

  assert.equal(result.error, undefined);
  assert.equal(result.value, 3);
});

test("getToolSchema inside sandbox returns tool definition", { skip: !hasQuickJs }, async () => {
  const { createCodeModeRuntime } = await import("../dist/index.js");
  const { source } = fakeSource();
  const runtime = await createCodeModeRuntime({ servers: [source], runtime: QUICKJS_RUNTIME });

  const result = await runtime.run(`
    var schema = await getToolSchema("github", "get_issue");
    return schema;
  `);

  assert.equal(result.error, undefined);
  const val = result.value as any;
  assert.ok(val !== null && typeof val === "object");
  assert.equal(val.toolName, "get_issue");
  assert.equal(val.serverId, "github");
  assert.ok(val.inputSchema !== undefined);
  assert.equal(val.inputSchema.type, "object");
  assert.ok(val.inputSchema.properties.issue_number !== undefined);
});

test("sequential awaited tool calls (issue #258 regression) do not crash the runtime", { skip: !hasQuickJs }, async () => {
  // #258 regression: sequential awaits on asyncified QuickJS functions crashed the
  // shared WASM module with "Lifetime not alive"; the promise-bridge runtime must
  // not trigger that bug, and the module must survive re-use across runs.
  const { createCodeModeRuntime } = await import("../dist/index.js");
  const { source } = fakeSource();
  const runtime = await createCodeModeRuntime({ servers: [source], runtime: QUICKJS_RUNTIME });

  const result = await runtime.run(`
    var a = await github.get_issue({ issue_number: 1 });
    var b = await github.create_issue({ title: "sequential" });
    return { a, b };
  `);

  assert.equal(result.error, undefined);
  assert.equal(result.toolCalls.length, 2);
  assert.equal(result.toolCalls[0].toolName, "get_issue");
  assert.equal(result.toolCalls[0].ok, true);
  assert.equal(result.toolCalls[1].toolName, "create_issue");
  assert.equal(result.toolCalls[1].ok, true);
  const valResult = result.value as any;
  assert.equal(valResult.a.args.issue_number, 1);
  assert.equal(valResult.b.args.title, "sequential");

  const second = await runtime.run(`return await github.get_issue({ issue_number: 3 });`);
  assert.equal(second.error, undefined);
  assert.equal(second.toolCalls.length, 1);
  const secondVal = second.value as any;
  assert.equal(secondVal.args.issue_number, 3);
});

test("timeout: infinite loop is interrupted", { skip: !hasQuickJs }, async () => {
  const { createCodeModeRuntime } = await import("../dist/index.js");
  const { source } = fakeSource();
  const runtime = await createCodeModeRuntime({ servers: [source], runtime: QUICKJS_RUNTIME });

  const result = await runtime.run("while(true) {}", {}, { timeoutMs: 100 });

  assert.notEqual(result.error, undefined, "Expected an error from infinite loop");
  assert.ok(
    result.error!.message.toLowerCase().includes("timeout") ||
      result.error!.message.toLowerCase().includes("interrupt"),
    `Expected error message about timeout/interrupt, got: ${result.error!.message}`,
  );
});
