import assert from "node:assert/strict";
import { test } from "vitest";

const hasIsolatedVm = await import("isolated-vm").then(
  () => true,
  () => false
);

/**
 * Creates a fake ToolServer for testing.
 */
function fakeSource(id = "github", tools: any = undefined) {
  const calls: any[] = [];
  return {
    calls,
    source: {
      id,
      name: id,
      serverId: id,
      serverName: id,
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
      id: "exa",
      name: "exa",
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

function fakeMcpEnvelopeSource(id = "docs") {
  const calls: any[] = [];
  return {
    calls,
    source: {
      id,
      name: id,
      serverId: id,
      serverName: id,
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

// -----------------------------------------------------------------------
// Test 1: Namespace bridging — server.tool(args) works WITHOUT await
// -----------------------------------------------------------------------
test("namespace bridging: github.get_issue(args) works without await", { skip: !hasIsolatedVm }, async () => {
  const { createCodeModeRuntime } = await import("../dist/index.js");
  const { calls, source } = fakeSource();
  const runtime = await createCodeModeRuntime({ servers: [source] });

  const result = await runtime.run(`
    const issue = github.get_issue({ issue_number: 42 });
    return { issue, found: true };
  `);

  assert.equal(result.error, undefined);
  const val195 = result.value as any;
  assert.deepEqual(val195.issue, { name: "get_issue", args: { issue_number: 42 } });
  assert.equal(val195.found, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, "get_issue");
});

// -----------------------------------------------------------------------
// Test 2: Namespace bridging with await also works
// -----------------------------------------------------------------------
test("namespace bridging: await github.get_issue(args) also works", { skip: !hasIsolatedVm }, async () => {
  const { createCodeModeRuntime } = await import("../dist/index.js");
  const { calls, source } = fakeSource();
  const runtime = await createCodeModeRuntime({ servers: [source] });

  const result = await runtime.run(`
    const issue = await github.get_issue({ issue_number: 99 });
    return issue;
  `);

  assert.equal(result.error, undefined);
  assert.deepEqual(result.value, { name: "get_issue", args: { issue_number: 99 } });
  assert.equal(calls.length, 1);
});

// -----------------------------------------------------------------------
// Test 3: callTool(serverId, toolName, args) escape hatch
// -----------------------------------------------------------------------
test("callTool() escape hatch works", { skip: !hasIsolatedVm }, async () => {
  const { createCodeModeRuntime } = await import("../dist/index.js");
  const { calls, source } = fakeSource();
  const runtime = await createCodeModeRuntime({ servers: [source] });

  const result = await runtime.run(`
    const issue = callTool("github", "get_issue", { issue_number: 7 });
    return issue;
  `);

  assert.equal(result.error, undefined);
  assert.deepEqual(result.value, { name: "get_issue", args: { issue_number: 7 } });
  assert.equal(calls.length, 1);
});

// -----------------------------------------------------------------------
// Test 4: searchTools() inside sandbox
// -----------------------------------------------------------------------
test("searchTools() inside sandbox returns results", { skip: !hasIsolatedVm }, async () => {
  const { createCodeModeRuntime } = await import("../dist/index.js");
  const { source } = fakeSource();
  const runtime = await createCodeModeRuntime({ servers: [source] });

  const result = await runtime.run(`
    const tools = searchTools("issue");
    return tools.map(t => ({ serverId: t.serverId, toolName: t.toolName }));
  `);

  assert.equal(result.error, undefined);
  assert.ok(Array.isArray(result.value));
  assert.ok(result.value.length > 0);
  assert.equal(result.value[0].serverId, "github");
});

// -----------------------------------------------------------------------
// Test 5: __interfaces contains TypeScript definitions
// -----------------------------------------------------------------------
test("__interfaces contains TypeScript definitions", { skip: !hasIsolatedVm }, async () => {
  const { createCodeModeRuntime } = await import("../dist/index.js");
  const { source } = fakeSource();
  const runtime = await createCodeModeRuntime({ servers: [source] });

  const result = await runtime.run(`
    return __interfaces;
  `);

  assert.equal(result.error, undefined);
  assert.ok(typeof result.value === "string");
  assert.ok(result.value.includes("namespace github"));
  assert.ok(result.value.includes("get_issueInput"));
  assert.ok(result.value.includes("issue_number"));
});

// -----------------------------------------------------------------------
// Test 6: __getToolInterface() returns specific tool interface
// -----------------------------------------------------------------------
test("__getToolInterface() returns specific tool interface", { skip: !hasIsolatedVm }, async () => {
  const { createCodeModeRuntime } = await import("../dist/index.js");
  const { source } = fakeSource();
  const runtime = await createCodeModeRuntime({ servers: [source] });

  const result = await runtime.run(`
    const iface = __getToolInterface("github.get_issue");
    return iface;
  `);

  assert.equal(result.error, undefined);
  assert.ok(typeof result.value === "string");
  assert.ok(result.value.includes("github.get_issue(args)"));
});

// -----------------------------------------------------------------------
// Test 7: Multi-source namespace isolation
// -----------------------------------------------------------------------
test("multi-source: github.get_issue() vs exa.web_search()", { skip: !hasIsolatedVm }, async () => {
  const { createCodeModeRuntime } = await import("../dist/index.js");
  const github = fakeSource();
  const exa = fakeExaSource();
  const runtime = await createCodeModeRuntime({ servers: [github.source, exa.source] });

  const result = await runtime.run(`
    const issue = github.get_issue({ issue_number: 1 });
    const search = exa.web_search({ query: "hello world" });
    return { issue, search };
  `);

  assert.equal(result.error, undefined);
  const val308 = result.value as any;
  assert.deepEqual(val308.issue, { name: "get_issue", args: { issue_number: 1 } });
  assert.deepEqual(val308.search, { results: [{ title: "Result 1", url: "https://example.com" }] });
  assert.equal(github.calls.length, 1);
  assert.equal(exa.calls.length, 1);
});

// -----------------------------------------------------------------------
// Test 8: Console output capture
// -----------------------------------------------------------------------
test("console output is captured", { skip: !hasIsolatedVm }, async () => {
  const { createCodeModeRuntime } = await import("../dist/index.js");
  const { source } = fakeSource();
  const runtime = await createCodeModeRuntime({ servers: [source] });

  const result = await runtime.run(`
    console.log("hello");
    console.warn("caution");
    console.error("fail");
    return "done";
  `);

  assert.equal(result.error, undefined);
  assert.equal(result.value, "done");
  assert.equal(result.logs.length, 3);
  assert.equal(result.logs[0].level, "log");
  assert.equal(result.logs[1].level, "warn");
  assert.equal(result.logs[2].level, "error");
});

// -----------------------------------------------------------------------
// Test 9: Tool calls are tracked
// -----------------------------------------------------------------------
test("tool calls are tracked in result", { skip: !hasIsolatedVm }, async () => {
  const { createCodeModeRuntime } = await import("../dist/index.js");
  const { source } = fakeSource();
  const runtime = await createCodeModeRuntime({ servers: [source] });

  const result = await runtime.run(`
    github.get_issue({ issue_number: 1 });
    github.create_issue({ title: "test" });
    return "done";
  `);

  assert.equal(result.error, undefined);
  assert.equal(result.toolCalls.length, 2);
  assert.equal(result.toolCalls[0].toolName, "get_issue");
  assert.equal(result.toolCalls[0].ok, true);
  assert.equal(result.toolCalls[1].toolName, "create_issue");
  assert.equal(result.toolCalls[1].ok, true);
});

// -----------------------------------------------------------------------
// Test 10: Input passthrough
// -----------------------------------------------------------------------
test("input is accessible in sandbox", { skip: !hasIsolatedVm }, async () => {
  const { createCodeModeRuntime } = await import("../dist/index.js");
  const { source } = fakeSource();
  const runtime = await createCodeModeRuntime({ servers: [source] });

  const result = await runtime.run(`
    return { doubled: input.value * 2 };
  `, { value: 21 });

  assert.equal(result.error, undefined);
  assert.deepEqual(result.value, { doubled: 42 });
});

// -----------------------------------------------------------------------
// Test 11: Host-side searchTools and listServers
// -----------------------------------------------------------------------
test("runtime.searchTools() and runtime.listServers() work", { skip: !hasIsolatedVm }, async () => {
  const { createCodeModeRuntime } = await import("../dist/index.js");
  const github = fakeSource();
  const exa = fakeExaSource();
  const runtime = await createCodeModeRuntime({ servers: [github.source, exa.source] });

  const searchResults = await runtime.searchTools("search web");
  assert.ok(searchResults.length > 0);
  assert.equal(searchResults[0].toolName, "web_search");
  assert.equal(searchResults[0].serverId, "exa");

  const servers = runtime.listServers();
  assert.equal(servers.length, 2);
  assert.ok(servers.some(s => s.serverId === "github"));
  assert.ok(servers.some(s => s.serverId === "exa"));
});

// -----------------------------------------------------------------------
// Test 12: MCP-style tool responses are normalized for scripts
// -----------------------------------------------------------------------
test("MCP envelopes are normalized to script-friendly values", { skip: !hasIsolatedVm }, async () => {
  const { createCodeModeRuntime } = await import("../dist/index.js");
  const { source } = fakeMcpEnvelopeSource();
  const runtime = await createCodeModeRuntime({ servers: [source] });

  const result = await runtime.run(`
    return {
      structured: docs.structured_search({ query: "a" }),
      jsonText: callTool("docs", "json_text_search", { query: "b" }),
      plainText: docs.plain_text_search({ query: "c" }),
      multipart: callTool("docs", "multipart_search", { query: "d" })
    };
  `);

  assert.equal(result.error, undefined);
  const val414 = result.value as any;
  assert.deepEqual(val414.structured, {
    items: [{ title: "Structured result" }]
  });
  assert.deepEqual(val414.jsonText, {
    items: [{ title: "JSON text result" }]
  });
  assert.equal(val414.plainText, "plain text result");
  assert.deepEqual(val414.multipart, {
    content: [
      { type: "text", text: "first" },
      { type: "text", text: "second" }
    ],
    isError: true
  });
});

// -----------------------------------------------------------------------
// Test 13: Single text error envelope preserves isError flag
// -----------------------------------------------------------------------
test("error envelope: single text content preserves isError", { skip: !hasIsolatedVm }, async () => {
  const { createCodeModeRuntime } = await import("../dist/index.js");
  const { source } = fakeMcpEnvelopeSource();
  const runtime = await createCodeModeRuntime({ servers: [source] });

  const result = await runtime.run(`
    return callTool("docs", "error_single_text", { query: "x" });
  `);

  assert.equal(result.error, undefined);
  const val444 = result.value as any;
  assert.ok(val444 !== null && typeof val444 === "object");
  assert.equal(val444.isError, true);
  assert.equal(val444.content, "resource not found");
});

// -----------------------------------------------------------------------
// Test 14: JSON text error envelope preserves isError with parsed content
// -----------------------------------------------------------------------
test("error envelope: JSON text content is parsed and isError preserved", { skip: !hasIsolatedVm }, async () => {
  const { createCodeModeRuntime } = await import("../dist/index.js");
  const { source } = fakeMcpEnvelopeSource();
  const runtime = await createCodeModeRuntime({ servers: [source] });

  const result = await runtime.run(`
    return callTool("docs", "error_json_text", { query: "x" });
  `);

  assert.equal(result.error, undefined);
  const val = result.value as any;
  assert.ok(val !== null && typeof val === "object");
  assert.equal(val.isError, true);
  assert.ok(val.content !== null && typeof val.content === "object");
  assert.equal(val.content.code, 400);
  assert.equal(val.content.error, "invalid input");
});

// -----------------------------------------------------------------------
// Test 15: Error envelopes set toolCalls[].ok to false
// -----------------------------------------------------------------------
test("error envelope: toolCalls[].ok is false with error message", { skip: !hasIsolatedVm }, async () => {
  const { createCodeModeRuntime } = await import("../dist/index.js");
  const { source } = fakeMcpEnvelopeSource();
  const runtime = await createCodeModeRuntime({ servers: [source] });

  const result = await runtime.run(`
    callTool("docs", "error_single_text", { query: "x" });
    return "done";
  `);

  assert.equal(result.error, undefined);
  assert.equal(result.value, "done");
  assert.equal(result.toolCalls.length, 1);
  assert.equal(result.toolCalls[0].ok, false);
  assert.equal(result.toolCalls[0].error, "resource not found");
  assert.equal(result.toolCalls[0].serverId, "docs");
  assert.equal(result.toolCalls[0].toolName, "error_single_text");
});

// -----------------------------------------------------------------------
// Test 16: Successful tool calls still show ok: true alongside error ones
// -----------------------------------------------------------------------
test("error envelope: successful and failed calls are both tracked", { skip: !hasIsolatedVm }, async () => {
  const { createCodeModeRuntime } = await import("../dist/index.js");
  const { source } = fakeMcpEnvelopeSource();
  const runtime = await createCodeModeRuntime({ servers: [source] });

  const result = await runtime.run(`
    docs.plain_text_search({ query: "ok" });
    callTool("docs", "error_single_text", { query: "fail" });
    return "done";
  `);

  assert.equal(result.error, undefined);
  assert.equal(result.value, "done");
  assert.equal(result.toolCalls.length, 2);
  assert.equal(result.toolCalls[0].ok, true);
  assert.equal(result.toolCalls[1].ok, false);
  assert.equal(result.toolCalls[1].error, "resource not found");
});
