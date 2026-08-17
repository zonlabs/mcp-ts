import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { connectHttpMcpServer } from "../src/gateway/http-mcp-client.js";

function fakeClientFactory(options: {
  requireAuth?: boolean;
  captured: Array<Record<string, unknown>>;
  finished: Array<{ code: string; state?: string; iss?: string }>;
}) {
  return (config: Record<string, unknown>) => {
    options.captured.push(config);
    return {
      connect: async () => {
        if (options.requireAuth) {
          (config.onRedirect as (url: string) => void)("https://auth.example/authorize");
          throw new Error("OAuth authorization required");
        }
      },
      finishAuth: async (code: string, state?: string, iss?: string) => {
        options.finished.push({ code, state, iss });
      },
      listTools: async () => ({ tools: [] }),
      callTool: async () => ({}),
      disconnect: async () => undefined,
    };
  };
}

describe("HTTP MCP client", () => {
  test("connects without opening OAuth when the server is already accessible", async () => {
    const captured: Array<Record<string, unknown>> = [];
    let authorizeCalls = 0;
    const connection = await connectHttpMcpServer("https://mcp.example.test/mcp", {
      serverId: "remote:example",
      serverName: "Example",
      sessionStore: {} as never,
      createClient: fakeClientFactory({ captured, finished: [] }) as never,
      authorize: async () => {
        authorizeCalls += 1;
        throw new Error("unexpected authorization");
      },
    });

    assert.equal(authorizeCalls, 0);
    assert.equal(connection.getServerId(), "remote:example");
    assert.equal(connection.getServerName(), "Example");
    assert.equal(captured[0].serverUrl, "https://mcp.example.test/mcp");
  });

  test("opens OAuth and completes authorization when requested by the MCP server", async () => {
    const captured: Array<Record<string, unknown>> = [];
    const finished: Array<{ code: string; state?: string; iss?: string }> = [];
    const connection = await connectHttpMcpServer("https://mcp.example.test/mcp", {
      serverId: "remote:example",
      serverName: "Example",
      sessionStore: {} as never,
      createClient: fakeClientFactory({ requireAuth: true, captured, finished }) as never,
      authorize: async (authorizationUrl, callbackUrl) => {
        assert.equal(authorizationUrl, "https://auth.example/authorize");
        assert.equal(callbackUrl, "http://127.0.0.1:43111/oauth/callback");
        return { code: "oauth-code", state: "oauth-state", iss: "https://issuer.example" };
      },
    });

    assert.deepEqual(finished, [
      { code: "oauth-code", state: "oauth-state", iss: "https://issuer.example" },
    ]);
    assert.equal(connection.getServerUrl(), "https://mcp.example.test/mcp");
  });

  test("uses a stable session ID for the same MCP endpoint", async () => {
    const captured: Array<Record<string, unknown>> = [];
    const createClient = fakeClientFactory({ captured, finished: [] }) as never;
    const common = {
      serverId: "remote:example",
      serverName: "Example",
      sessionStore: {} as never,
      createClient,
    };

    await connectHttpMcpServer("https://mcp.example.test/mcp", common);
    await connectHttpMcpServer("https://mcp.example.test/mcp", common);

    assert.equal(captured[0].sessionId, captured[1].sessionId);
    assert.match(String(captured[0].sessionId), /^cli_[a-f0-9]{24}$/);
  });
});
