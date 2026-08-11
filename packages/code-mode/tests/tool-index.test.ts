import assert from "node:assert/strict";
import { test } from "vitest";
import { indexServers } from "../src/runtime/tool-index.js";
import type { ToolServer } from "../src/types.js";

function server(serverId: string, listTools: () => Promise<{ tools: { name: string }[] }>): ToolServer {
  return {
    serverId,
    serverName: serverId,
    listTools,
    callTool: async () => ({}),
  };
}

test("indexServers skips a hung server after the timeout and indexes the rest", async () => {
  const hung = server("hung", () => new Promise<never>(() => {}));
  const healthy = server("healthy", async () => ({ tools: [{ name: "do_thing" }] }));

  const indexed = await indexServers([hung, healthy], { listToolsTimeoutMs: 50 });

  assert.equal(indexed.length, 1);
  assert.equal(indexed[0].serverId, "healthy");
  assert.equal(indexed[0].toolName, "do_thing");
});

test("indexServers skips a server whose listTools rejects", async () => {
  const failing = server("failing", async () => {
    throw new Error("connection refused");
  });
  const healthy = server("healthy", async () => ({ tools: [{ name: "do_thing" }] }));

  const indexed = await indexServers([failing, healthy]);

  assert.equal(indexed.length, 1);
  assert.equal(indexed[0].serverId, "healthy");
});

test("indexServers still throws on duplicate server ids", async () => {
  const a = server("github", async () => ({ tools: [{ name: "a" }] }));
  const b = server("github", async () => ({ tools: [{ name: "b" }] }));

  await assert.rejects(() => indexServers([a, b]), /Duplicate tool server id "github"/);
});
