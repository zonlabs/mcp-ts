import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("follow-up prompts do not optimistically replace the sidebar chat title", async () => {
  const source = await readFile(new URL("./PlaygroundChat.tsx", import.meta.url), "utf8");

  assert.match(source, /getOptimisticChatTitle\(promptText,\s*messages\.length\)/);
  assert.doesNotMatch(source, /upsertChat\(\{\s*id:\s*chatId,\s*title:\s*initialTitle/);
});
