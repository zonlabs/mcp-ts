import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("MCP usage overview keeps dense usage UI responsive on small screens", async () => {
  const source = await readFile(new URL("./McpUsageOverview.tsx", import.meta.url), "utf8");

  assert.match(source, /<h2 className="text-xl font-semibold tracking-tight">Activity<\/h2>/);
  assert.match(source, /KeyRound/);
  assert.doesNotMatch(source, /ArrowRight/);
  assert.match(source, /border-red-500\/20/);
  assert.match(source, /dark:border-red-400\/20/);
  assert.match(source, /space-y-1 pl-4 sm:pl-0/);
  assert.match(source, /overflow-x-auto/);
  assert.match(source, /min-w-max/);
  assert.doesNotMatch(source, /fixed inset-x-4 bottom-4 z-\[220\]/);
  assert.match(source, /hidden sm:pointer-events-none/);
  assert.match(source, /sm:absolute[\s\S]*sm:bottom-full/);
  assert.match(source, /grid-cols-2/);
  assert.match(source, /sm:grid-cols-4/);
  assert.match(source, /rounded-xl border border-red-500\/20/);
  assert.match(source, /grid-cols-\[minmax\(0,1fr\)_auto\]/);
  assert.match(source, /min-w-full[\s\S]*sm:min-w-0/);
});
