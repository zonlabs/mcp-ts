import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("app edits return the saved server and clear stale selected app state", async () => {
  const layoutSource = await readFile(new URL("./McpClientLayout.tsx", import.meta.url), "utf8");
  const pageSource = await readFile(new URL("../../app/(main)/mcp/McpPageClient.tsx", import.meta.url), "utf8");
  const wrapperSource = await readFile(new URL("./McpClientWrapper.tsx", import.meta.url), "utf8");

  assert.match(layoutSource, /else\s*\{\s*setSelectedAppObj\(null\);\s*\}/);
  assert.match(layoutSource, /await\s+refetchUserServers\(\)/);
  assert.match(layoutSource, /handleSelectApp\(result\?\.server\s*\?\?\s*selectedServer\.id\)/);

  assert.match(pageSource, /return\s+result;/);
  assert.match(wrapperSource, /return\s+json;/);
});
