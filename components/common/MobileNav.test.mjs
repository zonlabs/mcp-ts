import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("mobile navigation uses the hammer icon for the MCP link", async () => {
  const source = await readFile(new URL("./MobileNav.tsx", import.meta.url), "utf8");

  assert.match(source, /Hammer/);
  assert.match(source, /\{ href: "\/mcp", label: "MCP", icon: Hammer \}/);
  assert.doesNotMatch(source, /\{ href: "\/mcp", label: "MCP", icon: Server \}/);
});
