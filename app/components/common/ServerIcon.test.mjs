import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./ServerIcon.tsx", import.meta.url), "utf8");

test("ServerIcon strips executable SVG content", () => {
  assert.match(source, /function sanitizeInlineSvg/);
  assert.match(source, /<script\\b/);
  assert.match(source, /on\[a-z-\]/);
  assert.match(source, /javascript:/);
});
