import { expect, test, vi } from "vitest";
import { connectRemote } from "../src/client.js";

test("mcpa connect uses the OAuth-capable HTTP connector", async () => {
  const connection = {
    listTools: async () => ({ tools: [] }),
    callTool: vi.fn(),
    close: vi.fn(async () => undefined),
    getServerId: () => "example.test_mcp",
    getServerName: () => "example.test",
    getServerUrl: () => "https://example.test/mcp",
  };
  const connectHttp = vi.fn(async () => connection);

  const client = await connectRemote("https://example.test/mcp", connectHttp as never);

  expect(connectHttp).toHaveBeenCalledWith("https://example.test/mcp", expect.objectContaining({
    serverId: "example.test_mcp",
    serverName: "example.test",
  }));
  expect(client.getServerId()).toBe("example.test_mcp");
  await client.close();
  expect(connection.close).toHaveBeenCalledOnce();
});
