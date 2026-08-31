import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("tool execution panel receives live connection tools before falling back to server tools", async () => {
  const source = await readFile(new URL("./McpClientLayout.tsx", import.meta.url), "utf8");

  assert.match(source, /const selectedServerConnection = selectedServer\s*\?\s*findConnectionForServer\(connections,\s*selectedServer\)\s*:\s*undefined;/);
  assert.match(source, /const selectedServerTools = \(selectedServerConnection\?\.tools as any\[\]\s*\|\s*undefined\)\s*\?\?\s*selectedServer\?\.tools\s*\?\?\s*\[\];/);
  assert.match(source, /tools=\{selectedServerTools\}/);
});
