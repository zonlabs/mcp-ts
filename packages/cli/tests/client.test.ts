import { expect, test, vi } from "vitest";
import * as clientModule from "../src/client.js";
import { connectMcpEndpoint } from "../src/client.js";

test("connectMcpEndpoint uses the OAuth-capable HTTP connector", async () => {
  const connection = {
    listTools: async () => ({ tools: [] }),
    callTool: vi.fn(),
    close: vi.fn(async () => undefined),
    getServerId: () => "example.test_mcp",
    getServerName: () => "example.test",
    getServerUrl: () => "https://example.test/mcp",
  };
  const connector = vi.fn(async () => connection);

  const client = await connectMcpEndpoint("https://example.test/mcp", connector as never);

  expect(connector).toHaveBeenCalledWith("https://example.test/mcp", expect.objectContaining({
    serverId: "example.test_mcp",
    serverName: "example.test",
  }));
  expect("connectRemote" in clientModule).toBe(false);
  expect("RemoteToolClient" in clientModule).toBe(false);
  await client.close();
});

test("connectMcpEndpoint forwards explicit authorization approval", async () => {
  const connection = {
    listTools: async () => ({ tools: [] }),
    callTool: vi.fn(),
    close: vi.fn(async () => undefined),
    getServerId: () => "example.test_mcp",
    getServerName: () => "example.test",
    getServerUrl: () => "https://example.test/mcp",
  };
  const connector = vi.fn(async () => connection);
  const approve = vi.fn(async () => true);

  await connectMcpEndpoint("https://example.test/mcp", {
    connector: connector as never,
    onAuthorizationRequired: approve,
  });

  expect(connector).toHaveBeenCalledWith("https://example.test/mcp", expect.objectContaining({
    onAuthorizationRequired: approve,
  }));
});

test("connectMcpEndpoint recognizes callback-only options", async () => {
  const connection = {
    listTools: async () => ({ tools: [] }),
    callTool: vi.fn(),
    close: vi.fn(async () => undefined),
    getServerId: () => "example.test_mcp",
    getServerName: () => "example.test",
    getServerUrl: () => "https://example.test/mcp",
  };
  const connector = vi.fn(async () => connection);
  const onProgress = vi.fn();

  await connectMcpEndpoint("https://example.test/mcp", {
    connector: connector as never,
    onProgress,
  });

  expect(connector).toHaveBeenCalledWith("https://example.test/mcp", expect.objectContaining({
    headers: undefined,
    onProgress,
  }));
});
