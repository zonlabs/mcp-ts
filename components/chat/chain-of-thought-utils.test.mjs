import assert from "node:assert/strict";
import test from "node:test";

import {
  buildChainOfThoughtSummary,
  hasToolStepDetails,
  getToolStepIconKey,
  getToolStepDescription,
  getToolStepStatus,
} from "./chain-of-thought-utils.ts";

test("builds a chain-of-thought summary from reasoning and tool parts", () => {
  const summary = buildChainOfThoughtSummary(
    [
      { type: "reasoning", text: "Search the connected tools first." },
      {
        type: "tool-search",
        state: "output-available",
        input: { query: "calendar" },
        output: { count: 2 },
      },
      { type: "text", text: "Here is the answer." },
    ],
    {
      getToolName: (part) => part.type.replace(/^tool-/, ""),
      isLastMessage: true,
      status: "ready",
    }
  );

  assert.equal(summary.hasChainOfThought, true);
  assert.equal(summary.reasoningText, "Search the connected tools first.");
  assert.deepEqual(summary.toolSteps, [
    {
      description: "Completed",
      iconKey: "search",
      input: { query: "calendar" },
      key: "tool-1",
      label: "search",
      output: { count: 2 },
      status: "complete",
    },
  ]);
});

test("marks the currently executing last tool as active", () => {
  assert.equal(getToolStepStatus("executing", true, "streaming"), "active");
  assert.equal(getToolStepStatus("in-progress", true, "streaming"), "active");
  assert.equal(getToolStepDescription("executing"), "Running");
});

test("marks pending and errored tool states with useful labels", () => {
  assert.equal(getToolStepStatus("input-available", true, "ready"), "pending");
  assert.equal(getToolStepStatus("output-error", false, "ready"), "complete");
  assert.equal(getToolStepDescription("output-error"), "Error");
});

test("tracks errored tool state independently of error text", () => {
  const summary = buildChainOfThoughtSummary(
    [
      {
        type: "tool-search",
        state: "output-error",
        errorText: "",
      },
    ],
    {
      getToolName: (part) => part.type.replace(/^tool-/, ""),
      isLastMessage: false,
      status: "ready",
    }
  );

  assert.equal(summary.toolSteps[0].hasError, true);
  assert.equal(summary.toolSteps[0].errorText, "");
});

test("classifies common tool names into semantic icon keys", () => {
  assert.equal(getToolStepIconKey("MCPASSISTANT_SEARCH_SERVERS"), "search");
  assert.equal(getToolStepIconKey("mcp_execute_tool"), "execute");
  assert.equal(getToolStepIconKey("mcp_get_tool_schema"), "read");
  assert.equal(getToolStepIconKey("read_file"), "read");
  assert.equal(getToolStepIconKey("connect_server"), "tool");
  assert.equal(getToolStepIconKey("custom_tool"), "tool");
});

test("detects when a tool step has expandable details", () => {
  assert.equal(hasToolStepDetails({ key: "1", label: "search", description: "Done", status: "complete" }), false);
  assert.equal(hasToolStepDetails({ key: "2", label: "search", description: "Done", status: "complete", input: {} }), true);
  assert.equal(hasToolStepDetails({ key: "3", label: "search", description: "Done", status: "complete", output: null }), true);
  assert.equal(hasToolStepDetails({ key: "4", label: "search", description: "Done", status: "complete", errorText: "failed" }), true);
});
