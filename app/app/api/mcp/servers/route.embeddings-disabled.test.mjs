import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

function stripLineComments(source) {
  return source
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("//"))
    .join("\n");
}

test("MCP server route does not actively call embedding storage", async () => {
  const source = await readFile(new URL("./route.ts", import.meta.url), "utf8");
  const activeSource = stripLineComments(source);

  assert.doesNotMatch(activeSource, /from\s+["']@\/lib\/ai\/embedding["']/);
  assert.doesNotMatch(activeSource, /\bstoreServerEmbeddings\s*\(/);
  assert.doesNotMatch(activeSource, /\bdeleteServerEmbeddings\s*\(/);
});
