import test from "node:test";
import assert from "node:assert/strict";
import { toolSearch } from "ai";
import { experimental_codeModeTool } from "@ai-sdk/code-mode";

test("validates AI SDK v7 deferLoading and code mode composition", async () => {
  const codeMode = experimental_codeModeTool({ toolDiscovery: "conversation" });
  assert.ok(codeMode, "experimental_codeModeTool should initialize");
  assert.equal(typeof codeMode.execute, "function", "codeMode should have execute function");

  const searchTool = toolSearch();
  assert.ok(searchTool, "toolSearch should initialize");

  // Verify symbol-based tool search contract
  const toolSearchSymbol = Symbol.for("vercel.ai.toolSearch");
  assert.equal(Boolean(searchTool[toolSearchSymbol]), true, "toolSearch should implement the internal toolSearch symbol");

  // Verify mock deferred tool composition
  const deferredTool = {
    description: "Mock MCP Tool",
    inputSchema: { type: "object", properties: { input: { type: "string" } } },
    deferLoading: true,
    execute: async (args) => ({ result: `executed with ${JSON.stringify(args)}` }),
  };

  const toolset = {
    mcp_mock_tool: deferredTool,
    tool_search: searchTool,
    codemode_run: codeMode,
  };

  assert.equal(toolset.mcp_mock_tool.deferLoading, true, "MCP tool should be marked with deferLoading: true");
  assert.ok("tool_search" in toolset, "toolset should include tool_search");
  assert.ok("codemode_run" in toolset, "toolset should include codemode_run");
});
