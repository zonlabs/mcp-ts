import { beforeEach, describe, expect, it, vi } from "vitest";
import { cmdConnect } from "../src/commands/connect.js";

const mocks = vi.hoisted(() => ({
  addOrUpdateServerConfig: vi.fn(() => ({ path: "C:/tmp/mcp.json" })),
  loadMcpJson: vi.fn(),
  connectMcpEndpoint: vi.fn(),
  listTools: vi.fn(async () => ({ tools: [] })),
  close: vi.fn(async () => undefined),
}));

vi.mock("../src/client.js", () => ({
  connectMcpEndpoint: mocks.connectMcpEndpoint,
}));

vi.mock("../src/gateway/config.js", () => ({
  addOrUpdateServerConfig: mocks.addOrUpdateServerConfig,
  loadMcpJson: mocks.loadMcpJson,
}));

vi.mock("../src/gateway/registry.js", () => ({
  LocalMcpConnection: class {},
}));

vi.mock("../src/ux.js", () => {
  const noop = vi.fn();
  return {
    printBanner: noop,
    spinner: () => ({ start: noop, stop: noop }),
    success: noop,
    treeNote: noop,
    writeLine: noop,
  };
});

describe("connect OAuth confirmation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadMcpJson.mockReturnValue({
      path: "C:/tmp/mcp.json",
      config: { mcpServers: {} },
    });
    mocks.connectMcpEndpoint.mockImplementation(async (_url, options) => {
      const approved = await options.onAuthorizationRequired("https://auth.example/authorize");
      if (!approved) throw new Error("auth required");
      return { listTools: mocks.listTools, close: mocks.close };
    });
  });

  it("continues connecting after the user approves browser authorization", async () => {
    const confirmAuthorization = vi.fn(async () => true);

    await cmdConnect(
      { name: "mem0", url: "https://mem0.example/mcp" },
      { save: false, confirmAuthorization },
    );

    expect(confirmAuthorization).toHaveBeenCalledOnce();
    expect(confirmAuthorization).toHaveBeenCalledWith("mem0");
    expect(mocks.listTools).toHaveBeenCalledOnce();
  });

  it("stops connecting when the user declines browser authorization", async () => {
    const confirmAuthorization = vi.fn(async () => false);

    await expect(cmdConnect(
      { name: "mem0", url: "https://mem0.example/mcp" },
      { save: false, confirmAuthorization },
    )).rejects.toThrow("auth required");

    expect(confirmAuthorization).toHaveBeenCalledOnce();
    expect(mocks.listTools).not.toHaveBeenCalled();
  });

  it("resolves a saved HTTP server by name before connecting", async () => {
    mocks.loadMcpJson.mockReturnValue({
      path: "C:/tmp/mcp.json",
      config: {
        mcpServers: {
          supermemory: {
            url: "https://supermemory.example/mcp",
            headers: { "x-workspace": "saved" },
          },
        },
      },
    });

    await cmdConnect(
      { name: "supermemory" },
      { save: false, confirmAuthorization: vi.fn(async () => true) },
    );

    expect(mocks.connectMcpEndpoint).toHaveBeenCalledWith(
      "https://supermemory.example/mcp",
      expect.objectContaining({ headers: { "x-workspace": "saved" } }),
    );
  });

  it("reports when a name is not present in mcp.json", async () => {
    await expect(cmdConnect(
      { name: "missing" },
      { save: false },
    )).rejects.toThrow('Server "missing" was not found in C:/tmp/mcp.json.');

    expect(mocks.connectMcpEndpoint).not.toHaveBeenCalled();
  });
});
