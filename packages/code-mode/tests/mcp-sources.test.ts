import assert from "node:assert/strict";
import { test } from "vitest";

const { mcpServer, mcpServers } = await import("../dist/index.js");

test("mcpServer: serverUrl is set when getServerUrl returns a URL", () => {
  const server = mcpServer("test", {
    listTools: async () => ({ tools: [] }),
    callTool: async () => ({}),
    getServerId: () => "test",
    getServerName: () => "Test Server",
    getServerUrl: () => "https://example.com/mcp",
  });

  assert.equal(server.serverUrl, "https://example.com/mcp");
});

test("mcpServer: serverUrl is undefined when client has no getServerUrl", () => {
  const server = mcpServer("test", {
    listTools: async () => ({ tools: [] }),
    callTool: async () => ({}),
    getServerId: () => "test",
    getServerName: () => "Test Server",
  });

  assert.equal(server.serverUrl, undefined);
});

test("mcpServer: serverUrl is undefined when getServerUrl returns undefined", () => {
  const server = mcpServer("test", {
    listTools: async () => ({ tools: [] }),
    callTool: async () => ({}),
    getServerId: () => "test",
    getServerName: () => "Test Server",
    getServerUrl: () => undefined,
  });

  assert.equal(server.serverUrl, undefined);
});

test("mcpServer: serverUrl is set to empty string when getServerUrl returns empty string", () => {
  const server = mcpServer("test", {
    listTools: async () => ({ tools: [] }),
    callTool: async () => ({}),
    getServerId: () => "test",
    getServerName: () => "Test Server",
    getServerUrl: () => "",
  });

  assert.equal(server.serverUrl, "");
});

test("mcpServers: propagates serverUrl from multiple clients", () => {
  const servers = mcpServers({
    getClients: () => [
      {
        listTools: async () => ({ tools: [] }),
        callTool: async () => ({}),
        getServerId: () => "server_a",
        getServerName: () => "Server A",
        getServerUrl: () => "https://a.example.com/mcp",
      },
      {
        listTools: async () => ({ tools: [] }),
        callTool: async () => ({}),
        getServerId: () => "server_b",
        getServerName: () => "Server B",
        getServerUrl: () => "https://b.example.com/mcp",
      },
      {
        listTools: async () => ({ tools: [] }),
        callTool: async () => ({}),
        getServerId: () => "server_c",
        getServerName: () => "Server C",
      },
    ],
  });

  assert.equal(servers.length, 3);
  assert.equal(servers[0].serverUrl, "https://a.example.com/mcp");
  assert.equal(servers[1].serverUrl, "https://b.example.com/mcp");
  assert.equal(servers[2].serverUrl, undefined);
});

test("mcpServer: serverId and serverName are unaffected by serverUrl", () => {
  const server = mcpServer("my_server", {
    listTools: async () => ({ tools: [] }),
    callTool: async () => ({}),
    getServerId: () => "my_server",
    getServerName: () => "My Server",
    getServerUrl: () => "https://example.com/mcp",
  });

  assert.equal(server.serverId, "my_server");
  assert.equal(server.serverName, "My Server");
  assert.equal(server.serverUrl, "https://example.com/mcp");
});

test("mcpServer: callTool and listTools still work with serverUrl set", async () => {
  const server = mcpServer("test", {
    listTools: async () => ({
      tools: [{ name: "my_tool", description: "A test tool" }],
    }),
    callTool: async (name, args) => ({ result: "ok", name, args }),
    getServerId: () => "test",
    getServerUrl: () => "https://example.com/mcp",
  });

  const tools = await server.listTools();
  assert.equal(tools.tools.length, 1);
  assert.equal(tools.tools[0].name, "my_tool");

  const result = await server.callTool("my_tool", { foo: "bar" });
  assert.deepEqual(result, { result: "ok", name: "my_tool", args: { foo: "bar" } });
});
