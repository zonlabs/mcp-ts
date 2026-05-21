import assert from "node:assert/strict";
import test from "node:test";

import { normalizeMessagesForModel } from "./chat-message-normalization.ts";

test("drops orphaned incomplete tool calls from interrupted assistant messages", () => {
  const messages = [
    {
      id: "assistant-1",
      role: "assistant",
      parts: [
        { type: "text", text: "Let me check that." },
        {
          type: "tool-mcp_execute_tool",
          state: "input-available",
          input: { name: "search_docs" },
          toolCallId: "call_123",
        },
      ],
    },
  ];

  const normalized = normalizeMessagesForModel(messages);

  assert.deepEqual(normalized[0].parts, [{ type: "text", text: "Let me check that." }]);
});

test("keeps completed tool call/result pairs in assistant messages", () => {
  const messages = [
    {
      id: "assistant-2",
      role: "assistant",
      parts: [
        {
          type: "tool-mcp_execute_tool",
          state: "input-available",
          input: { name: "search_docs" },
          toolCallId: "call_456",
        },
        {
          type: "tool-mcp_execute_tool",
          state: "output-available",
          output: { ok: true },
          toolCallId: "call_456",
        },
      ],
    },
  ];

  const normalized = normalizeMessagesForModel(messages);

  assert.equal(normalized[0].parts.length, 2);
  assert.equal(normalized[0].parts[0].toolCallId, "call_456");
  assert.equal(normalized[0].parts[1].toolCallId, "call_456");
});

test("keeps approval-responded tool parts so approved tools can resume", () => {
  const messages = [
    {
      id: "assistant-3",
      role: "assistant",
      parts: [
        {
          type: "tool-mcp_execute_tool",
          state: "approval-responded",
          approval: { approved: true },
          input: { name: "search_docs" },
          toolCallId: "call_789",
        },
      ],
    },
  ];

  const normalized = normalizeMessagesForModel(messages);

  assert.equal(normalized[0].parts.length, 1);
  assert.equal(normalized[0].parts[0].state, "approval-responded");
  assert.equal(normalized[0].parts[0].toolCallId, "call_789");
});

test("drops stale approval-responded tool parts from non-latest assistant messages", () => {
  const messages = [
    {
      id: "assistant-older",
      role: "assistant",
      parts: [
        {
          type: "tool-mcp_execute_tool",
          state: "approval-responded",
          approval: { approved: true },
          input: { name: "search_docs" },
          toolCallId: "call_old",
        },
      ],
    },
    {
      id: "assistant-latest",
      role: "assistant",
      parts: [
        { type: "text", text: "Continuing from the latest assistant message." },
      ],
    },
  ];

  const normalized = normalizeMessagesForModel(messages);

  assert.deepEqual(normalized[0].parts, []);
  assert.equal(normalized[1].parts.length, 1);
});

test("drops approval-requested tool parts when a newer user message exists", () => {
  const messages = [
    {
      id: "assistant-pending",
      role: "assistant",
      parts: [
        {
          type: "tool-mcp_execute_tool",
          state: "approval-requested",
          input: { name: "tavily_search" },
          toolCallId: "call_pending",
        },
      ],
    },
    {
      id: "user-followup",
      role: "user",
      parts: [{ type: "text", text: "lets leave it" }],
    },
  ];

  const normalized = normalizeMessagesForModel(messages);

  assert.deepEqual(normalized[0].parts, []);
  assert.equal(normalized[1].parts.length, 1);
});
