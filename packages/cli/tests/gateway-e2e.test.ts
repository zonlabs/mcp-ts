import { createServer } from "node:http";
import { describe, expect, it } from "vitest";
import { LocalHttpMcp } from "../src/gateway/local-http-mcp.js";
import { McpGatewayRegistry } from "../src/gateway/registry.js";
import { getGatewayHealth, pingGateway } from "../src/gateway/context.js";
import { Traffic } from "../src/traffic.js";
import { RemoteBridgeClient } from "../src/gateway/bridge-client.js";
import { connectMcpEndpoint } from "../src/client.js";

describe("Gateway End-to-End Integration Suite", () => {
  it("exposes the listener's actual port and generation through health", async () => {
    const registry = new McpGatewayRegistry({});
    await registry.start();
    const httpMcp = new LocalHttpMcp(registry, {
      host: "127.0.0.1",
      port: 0,
      path: "/mcp",
      identity: {
        pid: process.pid,
        mode: "daemon",
        generation: "11111111-1111-4111-8111-111111111111",
      },
    }, new Traffic());
    const endpoint = await httpMcp.start();
    const port = Number(new URL(endpoint).port);

    await expect(getGatewayHealth("127.0.0.1", port, 100)).resolves.toEqual({
      status: "ok",
      pid: process.pid,
      port,
      mode: "daemon",
      generation: "11111111-1111-4111-8111-111111111111",
    });

    await httpMcp.close();
    await registry.close();
  });

  it("returns configured startup failures from list_mcp_servers", async () => {
    const registry = new McpGatewayRegistry(
      { broken: { url: "https://broken.example/mcp" } },
      undefined,
      { connectHttp: async () => { throw new Error("connection refused"); } } as never,
    );
    await registry.start();
    const httpMcp = new LocalHttpMcp(
      registry,
      { host: "127.0.0.1", port: 0, path: "/mcp" },
      new Traffic(),
    );
    const endpoint = await httpMcp.start();
    const client = await connectMcpEndpoint(endpoint);

    const result = await client.callTool("list_mcp_servers", { query: "" }) as {
      content: Array<{ type: string; text: string }>;
    };
    expect(JSON.parse(result.content[0].text)).toEqual({ servers: [{
      server_id: "broken",
      server_name: "broken",
      source: "local",
      tool_count: 0,
      discovery_state: "error",
      error: "connection refused",
    }] });

    await client.close();
    await httpMcp.close();
    await registry.close();
  });

  describe("pingGateway validation", () => {
    it("rejects non-listening ports", async () => {
      const result = await pingGateway("127.0.0.1", 59998, "/mcp", 50);
      expect(result).toBeNull();
    });

    it("rejects 404 HTTP responses without false positives", async () => {
      const server = createServer((_req, res) => {
        res.writeHead(404, { "content-type": "text/plain" });
        res.end("Not Found");
      });
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const port = (server.address() as { port: number }).port;

      const result = await pingGateway("127.0.0.1", port, "/mcp", 100);
      expect(result).toBeNull();
      server.close();
    });

    it("rejects non-JSON 200 responses (e.g. foreign HTML web portals)", async () => {
      const server = createServer((_req, res) => {
        res.writeHead(200, { "content-type": "text/html" });
        res.end("<html><body>Portal</body></html>");
      });
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const port = (server.address() as { port: number }).port;

      const result = await pingGateway("127.0.0.1", port, "/mcp", 100);
      expect(result).toBeNull();
      server.close();
    });

    it("accepts valid JSON-RPC MCP endpoints", async () => {
      const server = createServer((_req, res) => {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { tools: [] } }));
      });
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const port = (server.address() as { port: number }).port;

      const result = await pingGateway("127.0.0.1", port, "/mcp", 100);
      expect(result).toBe(`http://127.0.0.1:${port}/mcp`);
      server.close();
    });
  });

  describe("LocalHttpMcp router caching and mutation invalidation", () => {
    it("caches ToolRouter instance and invalidates when catalog version changes", async () => {
      const registry = new McpGatewayRegistry({});
      await registry.start();
      const initialVersion = registry.getVersion();
      expect(initialVersion).toBeGreaterThanOrEqual(1);

      const traffic = new Traffic();
      const httpMcp = new LocalHttpMcp(registry, { host: "127.0.0.1", port: 0, path: "/mcp" }, traffic);
      const url = await httpMcp.start();

      const routerInstance1 = await (httpMcp as never as { getOrBuildRouter: () => Promise<unknown> }).getOrBuildRouter();
      const routerInstance2 = await (httpMcp as never as { getOrBuildRouter: () => Promise<unknown> }).getOrBuildRouter();
      expect(routerInstance1).toBe(routerInstance2);

      // Verify HTTP JSON-RPC endpoint responds
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
      });
      const body = await response.text();
      expect(body).toBeDefined();

      // Mutate catalog by replacing remote servers
      await registry.replaceRemoteCatalog({
        servers: [
          {
            serverId: "e2e-remote",
            serverName: "E2E Remote",
            tools: [{ name: "e2e_ping", inputSchema: { type: "object" } }],
          },
        ],
      }, async () => ({ content: [{ type: "text", text: "pong" }] }));

      expect(registry.getVersion()).toBeGreaterThan(initialVersion);

      const routerInstance3 = await (httpMcp as never as { getOrBuildRouter: () => Promise<unknown> }).getOrBuildRouter();
      expect(routerInstance3).not.toBe(routerInstance1);

      await httpMcp.close();
      await registry.close();
    });
  });

  describe("Hot-reloading on live HTTP gateway (connect/add, disconnect/remove, enable/disable)", () => {
    it("immediately reflects added, removed, enabled, and disabled servers over HTTP JSON-RPC without restart", async () => {
      const mockHttp = async (url: string, opts: any) => ({
        listTools: async () => ({
          tools: [
            {
              name: `${opts.serverName}_action`,
              description: `Tool for ${opts.serverName}`,
              inputSchema: { type: "object" },
            },
          ],
        }),
        callTool: async () => ({ content: [{ type: "text", text: `${opts.serverName}_ok` }] }),
        close: async () => {},
        getServerId: () => opts.serverId,
        getServerName: () => opts.serverName,
        getServerUrl: () => url,
      });

      // 1. Start with serverAlpha
      const registry = new McpGatewayRegistry(
        { serverAlpha: { url: "http://127.0.0.1:9101/mcp" } },
        undefined,
        { connectHttp: mockHttp as any },
      );
      await registry.start();

      const traffic = new Traffic();
      const httpMcp = new LocalHttpMcp(registry, { host: "127.0.0.1", port: 0, path: "/mcp", mode: "all" }, traffic);
      const url = await httpMcp.start();

      // 1. Initial State: serverAlpha active
      expect(registry.aggregatedTools().map((t) => t.name)).toContain("serverAlpha_action");
      const routerV1 = await (httpMcp as any).getOrBuildRouter();
      expect(routerV1).toBeDefined();

      // 2. Hot-reload: Add serverBeta, Remove serverAlpha
      const reload1 = await registry.reload({
        serverBeta: { url: "http://127.0.0.1:9102/mcp" },
      });
      expect(reload1.added).toEqual(["serverBeta"]);
      expect(reload1.removed).toEqual(["serverAlpha"]);

      expect(registry.aggregatedTools().map((t) => t.name)).toContain("serverBeta_action");
      expect(registry.aggregatedTools().map((t) => t.name)).not.toContain("serverAlpha_action");

      const routerV2 = await (httpMcp as any).getOrBuildRouter();
      expect(routerV2).not.toBe(routerV1);

      // 3. Disable serverBeta on-the-fly
      const reload2 = await registry.reload({
        serverBeta: { url: "http://127.0.0.1:9102/mcp", disabled: true },
      });
      expect(reload2.removed).toEqual(["serverBeta"]);
      expect(registry.aggregatedTools().map((t) => t.name)).not.toContain("serverBeta_action");

      const routerV3 = await (httpMcp as any).getOrBuildRouter();
      expect(routerV3).not.toBe(routerV2);

      // 4. Re-enable serverBeta on-the-fly
      const reload3 = await registry.reload({
        serverBeta: { url: "http://127.0.0.1:9102/mcp", disabled: false },
      });
      expect(reload3.added).toEqual(["serverBeta"]);
      expect(registry.aggregatedTools().map((t) => t.name)).toContain("serverBeta_action");

      const routerV4 = await (httpMcp as any).getOrBuildRouter();
      expect(routerV4).not.toBe(routerV3);

      await httpMcp.close();
      await registry.close();
    });
  });

  describe("RemoteBridgeClient lifecycle and disconnect state safety", () => {
    it("resets ready state immediately upon stopping or abnormal disconnect", async () => {
      const registry = new McpGatewayRegistry({});
      await registry.start();

      const client = new RemoteBridgeClient(registry, {
        remoteUrl: "https://127.0.0.1:59997/mcp",
        getAccessToken: async () => "mock-token",
        socketFactory: () => {
          const fake = {
            readyState: 0,
            on: () => fake,
            send: () => {},
            close: () => {},
          };
          return fake as never;
        },
      });

      await client.start();
      const readyBefore = await client.waitForReady(50);
      expect(readyBefore).toBe(false);

      await client.stop();
      const readyAfter = await client.waitForReady(50);
      expect(readyAfter).toBe(false);

      await registry.close();
    });
  });
});
