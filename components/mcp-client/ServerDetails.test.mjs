import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("ServerDetails removes the ID row and uses shadcn tooltips instead of native title attributes", async () => {
  const source = await readFile(new URL("./ServerDetails.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(source, /<span className="font-medium whitespace-nowrap">ID:<\/span>/);
  assert.match(source, /from "@\/components\/ui\/tooltip"/);
  assert.match(source, /<TooltipTrigger asChild>/);
  assert.match(source, /<TooltipContent/);
  assert.doesNotMatch(source, /title=\{/);
  assert.doesNotMatch(source, /title="/);
});

test("ServerDetails status tooltip prefers stored connection errors before server errors", async () => {
  const source = await readFile(new URL("./ServerDetails.tsx", import.meta.url), "utf8");

  assert.match(source, /stored\?\.error\s*\|\|\s*server\.error/);
});
