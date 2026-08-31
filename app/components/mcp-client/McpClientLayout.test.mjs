import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("McpClientLayout overview cards use neutral icon styling and keep total servers as public plus user counts", async () => {
  const source = await readFile(new URL("./McpClientLayout.tsx", import.meta.url), "utf8");

  assert.match(source, /value:\s*publicServersCount\s*\+\s*userServersCount/);
  assert.doesNotMatch(source, /text-blue-500/);
  assert.doesNotMatch(source, /text-green-500/);
  assert.doesNotMatch(source, /text-amber-500/);
  assert.doesNotMatch(source, /bg-blue-500\/10/);
  assert.doesNotMatch(source, /bg-green-500\/10/);
  assert.doesNotMatch(source, /bg-amber-500\/10/);
});
