import { createServer } from "node:http";
import { describe, expect, it } from "vitest";
import { LocalHttpMcp } from "../src/gateway/local-http-mcp.js";
import { McpGatewayRegistry } from "../src/gateway/registry.js";
import { pingGateway } from "../src/gateway/context.js";
import { Traffic } from "../src/traffic.js";
import { RemoteBridgeClient } from "../src/gateway/bridge-client.js";

describe("Gateway End-to-End Integration Suite", () => {
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
    it("caches McpServer instance and invalidates when catalog version changes", async () => {
      const registry = new McpGatewayRegistry({});
      await registry.start();
      const initialVersion = registry.getVersion();
      expect(initialVersion).toBeGreaterThanOrEqual(1);

      const traffic = new Traffic();
      const httpMcp = new LocalHttpMcp(registry, { host: "127.0.0.1", port: 0, path: "/mcp" }, traffic);
      const url = await httpMcp.start();

      const serverInstance1 = await (httpMcp as never as { getOrBuildMcpServer: () => Promise<unknown> }).getOrBuildMcpServer();
      const serverInstance2 = await (httpMcp as never as { getOrBuildMcpServer: () => Promise<unknown> }).getOrBuildMcpServer();
      expect(serverInstance1).toBe(serverInstance2);

      // Verify HTTP JSON-RPC endpoint responds
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
      });
      const body = await response.json();
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

      const serverInstance3 = await (httpMcp as never as { getOrBuildMcpServer: () => Promise<unknown> }).getOrBuildMcpServer();
      expect(serverInstance3).not.toBe(serverInstance1);

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
      const mcpV1 = await (httpMcp as any).getOrBuildMcpServer();
      expect(mcpV1).toBeDefined();

      // 2. Hot-reload: Add serverBeta, Remove serverAlpha
      const reload1 = await registry.reload({
        serverBeta: { url: "http://127.0.0.1:9102/mcp" },
      });
      expect(reload1.added).toEqual(["serverBeta"]);
      expect(reload1.removed).toEqual(["serverAlpha"]);

      expect(registry.aggregatedTools().map((t) => t.name)).toContain("serverBeta_action");
      expect(registry.aggregatedTools().map((t) => t.name)).not.toContain("serverAlpha_action");

      const mcpV2 = await (httpMcp as any).getOrBuildMcpServer();
      expect(mcpV2).not.toBe(mcpV1);

      // 3. Disable serverBeta on-the-fly
      const reload2 = await registry.reload({
        serverBeta: { url: "http://127.0.0.1:9102/mcp", disabled: true },
      });
      expect(reload2.removed).toEqual(["serverBeta"]);
      expect(registry.aggregatedTools().map((t) => t.name)).not.toContain("serverBeta_action");

      const mcpV3 = await (httpMcp as any).getOrBuildMcpServer();
      expect(mcpV3).not.toBe(mcpV2);

      // 4. Re-enable serverBeta on-the-fly
      const reload3 = await registry.reload({
        serverBeta: { url: "http://127.0.0.1:9102/mcp", disabled: false },
      });
      expect(reload3.added).toEqual(["serverBeta"]);
      expect(registry.aggregatedTools().map((t) => t.name)).toContain("serverBeta_action");

      const mcpV4 = await (httpMcp as any).getOrBuildMcpServer();
      expect(mcpV4).not.toBe(mcpV3);

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
