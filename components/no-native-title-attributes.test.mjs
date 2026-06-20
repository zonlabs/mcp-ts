import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

const ROOTS = ["app", "components", "lib", "hooks", "types"];
const ALLOWED_TITLE_FILES = new Set([
  path.join("app", "(main)", "(playground-app)", "settings", "preferences", "page.tsx"),
]);

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) return walk(fullPath);
      return [fullPath];
    })
  );
  return files.flat();
}

test("source files do not use native title attributes", async () => {
  const fileLists = await Promise.all(ROOTS.map((root) => walk(root)));
  const files = fileLists
    .flat()
    .filter((file) => /\.(tsx?|jsx?)$/.test(file))
    .filter((file) => !/\.test\./.test(file))
    .filter((file) => !ALLOWED_TITLE_FILES.has(file));

  const offenders = [];
  const titleAttributePattern = /<[^>]*\btitle\s*=/m;

  for (const file of files) {
    const source = await readFile(file, "utf8");
    if (titleAttributePattern.test(source)) offenders.push(file);
  }

  assert.deepEqual(offenders, []);
});
