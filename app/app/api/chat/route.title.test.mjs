import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("only the request that claims an untitled chat generates its title", async () => {
  const source = await readFile(new URL("./route.ts", import.meta.url), "utf8");

  assert.match(source, /async function claimTitleGeneration/);
  assert.match(source, /\.or\(`title\.is\.null,title\.eq\.\$\{NEW_CHAT_TITLE\}`\)/);
  assert.match(source, /update\(\{ title: fallbackTitle, updated_at: new Date\(\)\.toISOString\(\) \}\)/);
  assert.match(
    source,
    /userText && await claimTitleGeneration\(supabase, chatId, user\.id, userText\)/
  );
});

test("a failed title request retains the persisted prompt fallback", async () => {
  const source = await readFile(new URL("./route.ts", import.meta.url), "utf8");

  assert.match(source, /function fallbackTitleFromUserMessage\(userText: string\): string/);
  assert.match(source, /console\.error\('\[generateTitleFromUserMessage\] Failed:', err\);\s+return null;/);
});
