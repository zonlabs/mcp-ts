import { describe, expect, it, vi } from "vitest";
import {
  LocalHttpMcp,
  MCP_META_TOOL_NAMES,
  isSearchDiscoveryMode,
} from "../src/gateway/local-http-mcp.js";
import { pingGateway } from "../src/gateway/context.js";
import { McpGatewayRegistry } from "../src/gateway/registry.js";
import { Traffic } from "../src/traffic.js";

describe("LocalHttpMcp", () => {
  it("uses the remote MCP discovery vocabulary", () => {
    expect(MCP_META_TOOL_NAMES).toEqual({
      listServers: "list_mcp_servers",
      searchTools: "search_mcp_tools",
      getToolSchemas: "get_mcp_tool_schemas",
      callTool: "call_mcp_tool",
    });
  });

  it("defaults to search discovery", () => {
    expect(isSearchDiscoveryMode()).toBe(true);
    expect(isSearchDiscoveryMode("search")).toBe(true);
    expect(isSearchDiscoveryMode("all")).toBe(false);
  });

  it("caches the ToolRouter when registry version is unchanged and creates fresh McpServer instances", async () => {
    const registry = new McpGatewayRegistry({});
    await registry.start();
    const traffic = new Traffic();
    const server = new LocalHttpMcp(registry, { host: "127.0.0.1", port: 0, path: "/mcp" }, traffic);

    // Each request gets a fresh McpServer instance for concurrency safety
    const mcp1 = await (server as never as { createMcpServer: () => Promise<unknown> }).createMcpServer();
    const mcp2 = await (server as never as { createMcpServer: () => Promise<unknown> }).createMcpServer();
    expect(mcp1).not.toBe(mcp2);

    // Underlying router is cached across requests for same version
    const router1 = await (server as never as { getOrBuildRouter: () => Promise<unknown> }).getOrBuildRouter();
    const router2 = await (server as never as { getOrBuildRouter: () => Promise<unknown> }).getOrBuildRouter();
    expect(router1).toBe(router2);

    // After adding remote server, version increments and router cache invalidates
    await registry.replaceRemoteCatalog({
      servers: [
        {
          serverId: "new-remote",
          serverName: "Remote",
          tools: [{ name: "new_tool", inputSchema: { type: "object" } }],
        },
      ],
    }, vi.fn());

    const router3 = await (server as never as { getOrBuildRouter: () => Promise<unknown> }).getOrBuildRouter();
    expect(router3).not.toBe(router1);
    await registry.close();
  });

  it("handles concurrent async tool calls safely without transport collisions", async () => {
    const registry = new McpGatewayRegistry({});
    await registry.start();

    await registry.replaceRemoteCatalog({
      servers: [
        {
          serverId: "async-server",
          serverName: "Async Server",
          tools: [{ name: "async_echo", inputSchema: { type: "object" } }],
        },
      ],
    }, async (params) => {
      // Simulate asynchronous tool execution delay
      await new Promise((resolve) => setTimeout(resolve, 50));
      return { content: [{ type: "text", text: `echo-${JSON.stringify(params)}` }] };
    });

    const traffic = new Traffic();
    const server = new LocalHttpMcp(registry, { host: "127.0.0.1", port: 0, path: "/mcp" }, traffic);
    const url = await server.start();

    const p1 = fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "call-1",
        method: "tools/call",
        params: { name: "call_mcp_tool", arguments: { toolId: "async-server::async_echo", args: { q: 1 } } },
      }),
    });

    const p2 = fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "call-2",
        method: "tools/call",
        params: { name: "call_mcp_tool", arguments: { toolId: "async-server::async_echo", args: { q: 2 } } },
      }),
    });

    const [res1, res2] = await Promise.all([p1, p2]);
    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);

    const text1 = await res1.text();
    const text2 = await res2.text();

    expect(text1).toContain('"id":"call-1"');
    expect(text2).toContain('"id":"call-2"');

    await server.close();
    await registry.close();
  });
});

describe("pingGateway", () => {
  it("rejects non-MCP and error responses and prevents false positives", async () => {
    const originalFetch = globalThis.fetch;
    try {
      // 404 response
      globalThis.fetch = vi.fn().mockResolvedValueOnce(new Response("Not Found", { status: 404 }));
      expect(await pingGateway("127.0.0.1", 8765, "/mcp", 100)).toBeNull();

      // 500 error
      globalThis.fetch = vi.fn().mockResolvedValueOnce(new Response("Server Error", { status: 500 }));
      expect(await pingGateway("127.0.0.1", 8765, "/mcp", 100)).toBeNull();

      // 200 with HTML (e.g. random web server on 8765)
      globalThis.fetch = vi.fn().mockResolvedValueOnce(new Response("<html><body>Foreign App</body></html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      }));
      expect(await pingGateway("127.0.0.1", 8765, "/mcp", 100)).toBeNull();

      // 200 with application/octet-stream (binary data server)
      globalThis.fetch = vi.fn().mockResolvedValueOnce(new Response("BINARY DATA", {
        status: 200,
        headers: { "content-type": "application/octet-stream" },
      }));
      expect(await pingGateway("127.0.0.1", 8765, "/mcp", 100)).toBeNull();

      // 200 with generic JSON but not JSON-RPC 2.0
      globalThis.fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ result: 1 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }));
      expect(await pingGateway("127.0.0.1", 8765, "/mcp", 100)).toBeNull();

      // 200 with valid JSON-RPC
      globalThis.fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ jsonrpc: "2.0", result: { tools: [] } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }));
      expect(await pingGateway("127.0.0.1", 8765, "/mcp", 100)).toBe("http://127.0.0.1:8765/mcp");

      // 200 with text/event-stream
      globalThis.fetch = vi.fn().mockResolvedValueOnce(new Response("event: endpoint\ndata: /mcp\n\n", {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      }));
      expect(await pingGateway("127.0.0.1", 8765, "/mcp", 100)).toBe("http://127.0.0.1:8765/mcp");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
