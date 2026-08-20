import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("McpStoreProvider exposes tool policy actions from the SDK hook", async () => {
  const source = await readFile(new URL("../providers/McpStoreProvider.tsx", import.meta.url), "utf8");

  assert.match(source, /getToolAccess/);
  assert.match(source, /updateToolPolicy/);
  assert.match(source, /setMcpActions\(\{[^}]*getToolAccess[^}]*updateToolPolicy/s);
});

test("ToolAccessDialog supports all, allowlist, and denylist policies", async () => {
  const source = await readFile(new URL("./ToolAccessDialog.tsx", import.meta.url), "utf8");

  assert.match(source, /Tool access/);
  assert.match(source, /allowlist/);
  assert.match(source, /denylist/);
  assert.match(source, /getToolAccess/);
  assert.match(source, /accessible by AI/);
});
