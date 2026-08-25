import { describe, expect, it, vi } from "vitest";
import { connectMcpEndpoint } from "../src/client.js";
import {
  InitialCatalogBarrier,
  LocalHttpMcp,
  MCP_META_TOOL_NAMES,
  isSearchDiscoveryMode,
} from "../src/gateway/local-http-mcp.js";
import { pingGateway } from "../src/gateway/context.js";
import { McpGatewayRegistry } from "../src/gateway/registry.js";
import {
  callGatewayTool,
  fetchGatewayServers,
  fetchGatewayToolSchemas,
  searchGatewayTools,
} from "../src/gateway/meta-tools.js";
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

  it("returns the canonical search envelope and filters by exact serverId", async () => {
    const registry = new McpGatewayRegistry({});
    await registry.start();
    await registry.replaceRemoteCatalog({
      servers: [
        {
          serverId: "alpha",
          serverName: "Shared",
          tools: [{ name: "alpha_tool", description: "Alpha", inputSchema: { type: "object" } }],
        },
        {
          serverId: "beta",
          serverName: "Shared",
          tools: [{ name: "beta_tool", description: "Beta", inputSchema: { type: "object" } }],
        },
      ],
    }, vi.fn());
    const server = new LocalHttpMcp(
      registry,
      { host: "127.0.0.1", port: 0, path: "/mcp" },
      new Traffic(),
    );
    const endpoint = await server.start();
    const client = await connectMcpEndpoint(endpoint);

    try {
      await expect(searchGatewayTools(client, {
        query: "",
        serverId: "alpha",
        limit: 10,
        detail: "detailed",
      })).resolves.toMatchObject([
        { serverId: "alpha", toolName: "alpha_tool", description: "Alpha" },
      ]);
    } finally {
      await client.close();
      await server.close();
      await registry.close();
    }
  });

  it.each(["search", "all"] as const)(
    "keeps tools/list health immediate in %s mode while the first meta request awaits the remote snapshot",
    async (mode) => {
      const registry = new McpGatewayRegistry({});
      await registry.start();
      const initialCatalog = new InitialCatalogBarrier();
      const waitForInitialCatalog = vi.spyOn(initialCatalog, "wait");
      const server = new LocalHttpMcp(
        registry,
        { host: "127.0.0.1", port: 0, path: "/mcp", mode, initialCatalog },
        new Traffic(),
      );
      const endpoint = await server.start();
      const endpointUrl = new URL(endpoint);
      await expect(
        pingGateway(endpointUrl.hostname, Number(endpointUrl.port), endpointUrl.pathname, 250),
      ).resolves.toBe(endpoint);
      const client = await connectMcpEndpoint(endpoint);

      try {
        const listedTools = await client.listTools();
        expect(listedTools.tools.map((tool) => tool.name)).toContain(MCP_META_TOOL_NAMES.listServers);

        let settled = false;
        const firstList = fetchGatewayServers(client, "").finally(() => {
          settled = true;
        });

        await vi.waitFor(() => expect(waitForInitialCatalog).toHaveBeenCalled());
        expect(settled).toBe(false);

        await registry.replaceRemoteCatalog({
          servers: [
            {
              serverId: "github",
              serverName: "GitHub",
              tools: [{ name: "pull_request_read", inputSchema: { type: "object" } }],
            },
          ],
        }, vi.fn());
        expect(initialCatalog.settle({ state: "ready" })).toBe(true);

        await expect(firstList).resolves.toEqual([
          {
            serverId: "github",
            serverName: "GitHub",
            source: "remote",
            toolCount: 1,
            discoveryState: "complete",
          },
        ]);
        expect(initialCatalog.settle({ state: "error", error: new Error("late failure") })).toBe(false);
        await expect(initialCatalog.wait()).resolves.toEqual({ state: "ready" });
      } finally {
        await client.close();
        await server.close();
        await registry.close();
      }
    },
  );

  it("keeps concrete all-mode invocation behind readiness while tools/list stays immediate", async () => {
    const invoke = vi.fn(async () => ({ content: [{ type: "text" as const, text: "local-result" }] }));
    const registry = new McpGatewayRegistry(
      { docs: { url: "https://docs.example/mcp" } },
      undefined,
      {
        connectHttp: async () => ({
          listTools: async () => ({
            tools: [{ name: "local_echo", inputSchema: { type: "object" as const } }],
          }),
          callTool: invoke,
          close: vi.fn(async () => undefined),
          getServerId: () => "docs",
          getServerName: () => "docs",
          getServerUrl: () => "https://docs.example/mcp",
        }),
      } as never,
    );
    await registry.start();
    const initialCatalog = new InitialCatalogBarrier();
    const server = new LocalHttpMcp(
      registry,
      { host: "127.0.0.1", port: 0, path: "/mcp", mode: "all", initialCatalog },
      new Traffic(),
    );
    const endpoint = await server.start();
    const client = await connectMcpEndpoint(endpoint);

    try {
      await expect(client.listTools()).resolves.toMatchObject({
        tools: expect.arrayContaining([expect.objectContaining({ name: "local_echo" })]),
      });

      const invocation = client.callTool("local_echo", {});
      const beforeReady = await Promise.race([
        invocation.then(() => "invoked" as const),
        new Promise<"pending">((resolve) => setTimeout(() => resolve("pending"), 50)),
      ]);
      expect(beforeReady).toBe("pending");
      expect(invoke).not.toHaveBeenCalled();

      initialCatalog.settle({ state: "local-only" });
      await expect(invocation).resolves.toMatchObject({
        content: [{ type: "text", text: "local-result" }],
      });
      expect(invoke).toHaveBeenCalledOnce();
    } finally {
      await client.close();
      await server.close();
      await registry.close();
    }
  });

  it("reserves meta-tool names in all mode without hiding canonical upstream access", async () => {
    const invoke = vi.fn(async () => ({ content: [{ type: "text" as const, text: "upstream-result" }] }));
    const registry = new McpGatewayRegistry(
      { docs: { url: "https://docs.example/mcp" } },
      undefined,
      {
        connectHttp: async () => ({
          listTools: async () => ({
            tools: [{ name: MCP_META_TOOL_NAMES.listServers, inputSchema: { type: "object" as const } }],
          }),
          callTool: invoke,
          close: vi.fn(async () => undefined),
          getServerId: () => "docs",
          getServerName: () => "docs",
          getServerUrl: () => "https://docs.example/mcp",
        }),
      } as never,
    );
    await registry.start();
    const initialCatalog = new InitialCatalogBarrier();
    const server = new LocalHttpMcp(
      registry,
      { host: "127.0.0.1", port: 0, path: "/mcp", mode: "all", initialCatalog },
      new Traffic(),
    );
    const endpoint = await server.start();
    const client = await connectMcpEndpoint(endpoint);

    try {
      const listed = await client.listTools();
      expect(listed.tools.filter((tool) => tool.name === MCP_META_TOOL_NAMES.listServers)).toHaveLength(1);

      initialCatalog.settle({ state: "local-only" });
      await expect(
        callGatewayTool(client, `docs::${MCP_META_TOOL_NAMES.listServers}`, {}),
      ).resolves.toMatchObject({ content: [{ type: "text", text: "upstream-result" }] });
      expect(invoke).toHaveBeenCalledOnce();
    } finally {
      await client.close();
      await server.close();
      await registry.close();
    }
  });

  it("serves local-only meta requests after an explicit no-session outcome", async () => {
    const registry = new McpGatewayRegistry(
      { docs: { url: "https://docs.example/mcp" } },
      undefined,
      {
        connectHttp: async () => ({
          listTools: async () => ({
            tools: [{ name: "search_docs", inputSchema: { type: "object" as const } }],
          }),
          callTool: vi.fn(),
          close: vi.fn(async () => undefined),
          getServerId: () => "docs",
          getServerName: () => "docs",
          getServerUrl: () => "https://docs.example/mcp",
        }),
      } as never,
    );
    await registry.start();
    const initialCatalog = new InitialCatalogBarrier();
    initialCatalog.settle({ state: "local-only" });
    const server = new LocalHttpMcp(
      registry,
      { host: "127.0.0.1", port: 0, path: "/mcp", initialCatalog },
      new Traffic(),
    );
    const endpoint = await server.start();
    const client = await connectMcpEndpoint(endpoint);

    try {
      await expect(fetchGatewayServers(client, "")).resolves.toEqual([
        {
          serverId: "docs",
          serverName: "docs",
          source: "local",
          toolCount: 1,
          discoveryState: "complete",
        },
      ]);
    } finally {
      await client.close();
      await server.close();
      await registry.close();
    }
  });

  it("surfaces the same definitive initialization error from every meta operation", async () => {
    const registry = new McpGatewayRegistry({});
    await registry.start();
    const initialCatalog = new InitialCatalogBarrier();
    initialCatalog.settle({ state: "error", error: new Error("remote catalog initialization failed") });
    const server = new LocalHttpMcp(
      registry,
      { host: "127.0.0.1", port: 0, path: "/mcp", initialCatalog },
      new Traffic(),
    );
    const endpoint = await server.start();
    const client = await connectMcpEndpoint(endpoint);

    try {
      await expect(fetchGatewayServers(client, "")).rejects.toThrow("remote catalog initialization failed");
      await expect(searchGatewayTools(client, { query: "pull request" })).rejects.toThrow(
        "remote catalog initialization failed",
      );
      await expect(fetchGatewayToolSchemas(client, ["github::pull_request_read"])).rejects.toThrow(
        "remote catalog initialization failed",
      );
      await expect(callGatewayTool(client, "github::pull_request_read", {})).rejects.toThrow(
        "remote catalog initialization failed",
      );
    } finally {
      await client.close();
      await server.close();
      await registry.close();
    }
  });

  it("recovers from initial remote error upon explicit activation in a new generation", async () => {
    const registry = new McpGatewayRegistry({});
    await registry.start();
    const initialCatalog = new InitialCatalogBarrier();
    const initialGen = initialCatalog.getGeneration();
    initialCatalog.settle({ state: "error", error: new Error("initial remote failure") }, initialGen);

    let activateOutcome = { ready: false };
    const activateRemote = vi.fn(async () => {
      const gen = initialCatalog.beginActivation();
      await registry.replaceRemoteCatalog({
        servers: [
          {
            serverId: "recovered-github",
            serverName: "Recovered GitHub",
            tools: [{ name: "recovered_tool", inputSchema: { type: "object" } }],
          },
        ],
      }, vi.fn());
      initialCatalog.settle({ state: "ready" }, gen);
      activateOutcome = { ready: true };
      return activateOutcome;
    });

    const server = new LocalHttpMcp(
      registry,
      { host: "127.0.0.1", port: 0, path: "/mcp", initialCatalog, activateRemote },
      new Traffic(),
    );
    const endpoint = await server.start();
    const client = await connectMcpEndpoint(endpoint);

    try {
      // 1. Initial error is visible before activation
      await expect(fetchGatewayServers(client, "")).rejects.toThrow("initial remote failure");

      // 2. Stale settlement from older generation cannot settle newer generation
      const newGen = initialCatalog.beginActivation();
      expect(initialCatalog.settle({ state: "error", error: new Error("stale completion") }, initialGen)).toBe(false);

      // 3. Meta operation awaits new generation
      let settled = false;
      const pendingFetch = fetchGatewayServers(client, "").finally(() => { settled = true; });
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(settled).toBe(false);

      // 4. Settling the new generation allows meta operation to succeed
      await registry.replaceRemoteCatalog({
        servers: [
          {
            serverId: "recovered-github",
            serverName: "Recovered GitHub",
            tools: [{ name: "recovered_tool", inputSchema: { type: "object" } }],
          },
        ],
      }, vi.fn());
      expect(initialCatalog.settle({ state: "ready" }, newGen)).toBe(true);

      await expect(pendingFetch).resolves.toEqual([
        {
          serverId: "recovered-github",
          serverName: "Recovered GitHub",
          source: "remote",
          toolCount: 1,
          discoveryState: "complete",
        },
      ]);
    } finally {
      await client.close();
      await server.close();
      await registry.close();
    }
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
