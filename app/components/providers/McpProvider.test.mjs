import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./McpProvider.tsx", import.meta.url), "utf8");

test("McpProvider supplies context before a user is available", () => {
  assert.match(source, /const unauthenticatedMcpContext/);
  assert.match(source, /<McpContext\.Provider value=\{unauthenticatedMcpContext\}>/);
});
