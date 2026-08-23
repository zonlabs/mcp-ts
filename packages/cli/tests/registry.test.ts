import { describe, expect, it, vi } from "vitest";
import type { CatalogSnapshot } from "@mcp-ts/bridge-protocol";
import { McpGatewayRegistry, canonicalToolId } from "../src/gateway/registry.js";

describe("McpGatewayRegistry", () => {
  it("creates deterministic canonical tool IDs", () => {
    expect(canonicalToolId("local:files", "read_file")).toBe("local:files::read_file");
    expect(canonicalToolId("local:files", "read_file")).toBe("local:files::read_file");
  });

  it("never publishes remote servers as part of the local catalog", async () => {
    const registry = new McpGatewayRegistry({});
    const remote: CatalogSnapshot = {
      servers: [
        {
          serverId: "github",
          serverName: "GitHub",
          tools: [{ name: "create_issue", inputSchema: { type: "object" } }],
        },
      ],
    };
    await registry.replaceRemoteCatalog(remote, vi.fn());

    expect(registry.getLocalCatalog()).toEqual({ servers: [] });
    expect(registry.getRemoteCatalog()).toEqual(remote);
  });

  it("fully replaces remote catalogs, including with an empty snapshot", async () => {
    const registry = new McpGatewayRegistry({});
    await registry.replaceRemoteCatalog(
      {
        servers: [
          {
            serverId: "github",
            serverName: "GitHub",
            tools: [{ name: "create_issue", inputSchema: { type: "object" } }],
          },
        ],
      },
      vi.fn(),
    );
    await registry.replaceRemoteCatalog({ servers: [] }, vi.fn());

    expect(registry.getRemoteCatalog()).toEqual({ servers: [] });
    expect(registry.aggregatedTools()).toEqual([]);
  });

  it("uses the OAuth-capable connector for configured HTTP servers", async () => {
    const close = vi.fn(async () => undefined);
    const connectHttp = vi.fn(async () => ({
      listTools: async () => ({
        tools: [{ name: "search_docs", inputSchema: { type: "object" as const } }],
      }),
      callTool: vi.fn(),
      close,
      getServerId: () => "docs",
      getServerName: () => "docs",
      getServerUrl: () => "https://docs.example/mcp",
    }));
    const registry = new McpGatewayRegistry(
      { docs: { url: "https://docs.example/mcp" } },
      undefined,
      { connectHttp } as never,
    );

    await registry.start();

    expect(connectHttp).toHaveBeenCalledWith("https://docs.example/mcp", expect.objectContaining({
      serverId: "docs",
      serverName: "docs",
    }));
    expect(registry.getLocalCatalog().servers[0].tools[0].name).toBe("search_docs");
    await registry.close();
    expect(close).toHaveBeenCalledOnce();
  });

  it("reports local server startup errors by server ID", async () => {
    const registry = new McpGatewayRegistry(
      { docs: { url: "https://docs.example/mcp" } },
      undefined,
      { connectHttp: async () => { throw new Error("connection refused"); } } as never,
    );

    await registry.start();

    expect(registry.getLocalServerStartupErrors()).toEqual(
      new Map([["docs", "connection refused"]]),
    );
  });

  it("increments version counter on catalog mutations", async () => {
    const registry = new McpGatewayRegistry({});
    const initialVersion = registry.getVersion();
    expect(initialVersion).toBe(0);

    await registry.start();
    expect(registry.getVersion()).toBe(1);

    await registry.replaceRemoteCatalog({
      servers: [
        {
          serverId: "remote-test",
          serverName: "Remote Test",
          tools: [{ name: "test_tool", inputSchema: { type: "object" } }],
        },
      ],
    }, vi.fn());
    expect(registry.getVersion()).toBe(2);

    await registry.close();
    expect(registry.getVersion()).toBe(3);
  });

  it("rolls back remote catalog if error occurs during replacement", async () => {
    const registry = new McpGatewayRegistry({});
    const initialRemote: CatalogSnapshot = {
      servers: [
        {
          serverId: "stable-server",
          serverName: "Stable",
          tools: [{ name: "stable_tool", inputSchema: { type: "object" } }],
        },
      ],
    };
    await registry.replaceRemoteCatalog(initialRemote, vi.fn());
    expect(registry.getRemoteCatalog().servers).toHaveLength(1);

    // Mock rebuildIndex to throw error
    const spy = vi.spyOn(registry as unknown as { rebuildIndex: () => Promise<void> }, "rebuildIndex").mockRejectedValueOnce(new Error("Index build failed"));

    try {
      await expect(
        registry.replaceRemoteCatalog({
          servers: [
            {
              serverId: "broken-server",
              serverName: "Broken",
              tools: [{ name: "broken_tool", inputSchema: { type: "object" } }],
            },
          ],
        }, vi.fn())
      ).rejects.toThrow("Index build failed");

      // Must rollback to initialRemote
      expect(registry.getRemoteCatalog().servers[0].serverId).toBe("stable-server");
    } finally {
      spy.mockRestore();
    }
  });
});
