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

  it("caches the McpServer and router when registry version is unchanged", async () => {
    const registry = new McpGatewayRegistry({});
    await registry.start();
    const traffic = new Traffic();
    const server = new LocalHttpMcp(registry, { host: "127.0.0.1", port: 0, path: "/mcp" }, traffic);

    const mcp1 = await (server as never as { getOrBuildMcpServer: () => Promise<unknown> }).getOrBuildMcpServer();
    const mcp2 = await (server as never as { getOrBuildMcpServer: () => Promise<unknown> }).getOrBuildMcpServer();
    expect(mcp1).toBe(mcp2);

    // After adding remote server, version increments and cache invalidates
    await registry.replaceRemoteCatalog({
      servers: [
        {
          serverId: "new-remote",
          serverName: "Remote",
          tools: [{ name: "new_tool", inputSchema: { type: "object" } }],
        },
      ],
    }, vi.fn());

    const mcp3 = await (server as never as { getOrBuildMcpServer: () => Promise<unknown> }).getOrBuildMcpServer();
    expect(mcp3).not.toBe(mcp1);
    await registry.close();
  });
});

describe("pingGateway", () => {
  it("rejects non-MCP and error responses", async () => {
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

      // 200 with valid JSON-RPC
      globalThis.fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ jsonrpc: "2.0", result: { tools: [] } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }));
      expect(await pingGateway("127.0.0.1", 8765, "/mcp", 100)).toBe("http://127.0.0.1:8765/mcp");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
