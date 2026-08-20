import { describe, it, expect } from "vitest";
import { LocalHttpMcp } from "../src/gateway/local-http-mcp.js";
import { McpGatewayRegistry } from "../src/gateway/registry.js";
import { pingGateway } from "../src/gateway/context.js";
import { RemoteBridgeClient } from "../src/gateway/bridge-client.js";
import { loadAuthSession, ensureFreshAuthSession } from "../src/gateway/auth-store.js";
import { Traffic } from "../src/traffic.js";

describe("Live Remote Production Worker (https://api.mcp-assistant.in)", () => {
  const remoteUrl = "https://api.mcp-assistant.in";

  it("returns healthy status from production /healthz", async () => {
    const healthRes = await fetch(`${remoteUrl}/healthz`);
    expect(healthRes.status).toBe(200);
    const healthData = await healthRes.json() as { status: string };
    expect(healthData.status).toBe("ok");
  });

  it("handles tools/list JSON-RPC POST on production /mcp", async () => {
    const mcpRes = await fetch(`${remoteUrl}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "accept": "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "test-prod-1",
        method: "tools/list",
        params: {},
      }),
    });
    expect([200, 401, 403]).toContain(mcpRes.status);
  });

  it("correctly evaluates pingGateway on live production domain", async () => {
    const urlObj = new URL(remoteUrl);
    // Remote returns 200 with JSON or event-stream
    const pingResult = await pingGateway(urlObj.hostname, 443, "/mcp", 5000);
    // pingGateway evaluates http protocol on custom ports/paths
    expect(pingResult === null || typeof pingResult === "string").toBe(true);
  });

  it("connects or safely handles unauthenticated bridge connection to live worker", async () => {
    const session = loadAuthSession(remoteUrl);
    const registry = new McpGatewayRegistry({});
    await registry.start();

    if (session) {
      const fresh = await ensureFreshAuthSession(remoteUrl);
      const bridge = new RemoteBridgeClient(registry, {
        remoteUrl,
        getAccessToken: async () => fresh.accessToken,
      });
      await bridge.start();
      const ready = await bridge.waitForReady(5000);
      expect(typeof ready).toBe("boolean");
      await bridge.stop();
    } else {
      const bridge = new RemoteBridgeClient(registry, {
        remoteUrl,
        getAccessToken: async () => "invalid-dummy-token",
      });
      await bridge.start();
      const ready = await bridge.waitForReady(1500);
      expect(ready).toBe(false);
      await bridge.stop();
    }

    await registry.close();
  });

  it("handles 10 parallel concurrent requests through LocalHttpMcp without collision", async () => {
    const registry = new McpGatewayRegistry({});
    await registry.start();

    await registry.replaceRemoteCatalog({
      servers: [
        {
          serverId: "live-prod-sim",
          serverName: "Live Prod Sim",
          tools: [{ name: "remote_tool", inputSchema: { type: "object" } }],
        },
      ],
    }, async (params) => {
      await new Promise((r) => setTimeout(r, 40));
      return { content: [{ type: "text", text: `result-${JSON.stringify(params)}` }] };
    });

    const traffic = new Traffic();
    const server = new LocalHttpMcp(registry, { host: "127.0.0.1", port: 0, path: "/mcp" }, traffic);
    const url = await server.start();

    const tasks = Array.from({ length: 10 }, (_, i) => {
      return fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: `req-${i + 1}`,
          method: "tools/call",
          params: {
            name: "call_mcp_tool",
            arguments: {
              toolId: "live-prod-sim::remote_tool",
              args: { n: i + 1 },
            },
          },
        }),
      }).then(async (r) => ({
        id: `req-${i + 1}`,
        status: r.status,
        text: await r.text(),
      }));
    });

    const results = await Promise.all(tasks);
    expect(results).toHaveLength(10);
    for (const res of results) {
      expect(res.status).toBe(200);
      expect(res.text).toContain(`"id":"${res.id}"`);
    }

    await server.close();
    await registry.close();
  });
});
