import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("deletes only the authenticated user's MCP usage events", async () => {
  const source = await readFile(new URL("./route.ts", import.meta.url), "utf8");

  assert.match(source, /export async function DELETE\(\)/);
  assert.match(source, /supabase\.auth\.getUser\(\)/);
  assert.match(source, /\.from\("mcp_tool_call_events"\)\s+\.delete\(\{ count: "exact" \}\)\s+\.eq\("user_id", user\.id\)/);
  assert.match(source, /deletedCount: count \?\? 0/);
});
