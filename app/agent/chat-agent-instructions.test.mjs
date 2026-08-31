import assert from "node:assert/strict";
import test from "node:test";

import {
  buildChatAgentInstructions,
  PINNED_REMOTE_TOOLS,
} from "./chat-agent-instructions.ts";

test("pins codemode_run for direct remote availability", () => {
  assert.deepEqual(PINNED_REMOTE_TOOLS, ["codemode_run"]);
});

test("instructs the agent to use codemode_run directly when available", () => {
  const instructions = buildChatAgentInstructions(
    new Date("2026-05-21T12:00:00.000Z"),
    { timezone: "Asia/Kolkata" }
  );

  assert.equal(
    instructions.includes("If `codemode_run` is already available in your tools alongside the meta tools, call it directly"),
    true
  );
  assert.equal(
    instructions.includes("Use `codemode_run` when a task benefits from writing code to chain multiple MCP tool calls"),
    true
  );
  assert.equal(
    instructions.includes("If `codemode_run` is directly available and the task needs multi-step tool chaining or code-based post-processing of tool outputs, prefer `codemode_run`"),
    true
  );
});
