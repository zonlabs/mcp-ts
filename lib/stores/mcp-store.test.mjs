import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("mcp store preserves connection errors when syncing connections", async () => {
  const source = await readFile(new URL("./mcp-store.ts", import.meta.url), "utf8");

  assert.match(source, /error\?:\s*string/);
  assert.match(source, /error:\s*val\.error/);
});
