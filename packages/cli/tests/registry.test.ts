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

  it("does not retry an unchanged server that already failed when another server is removed", async () => {
    const connectHttp = vi.fn(async () => {
      throw new Error("authentication required");
    });
    const registry = new McpGatewayRegistry(
      {
        mem0: { url: "https://mem0.example/mcp" },
        filesystem: { command: "unused" },
      },
      undefined,
      { connectHttp } as never,
    );

    await registry.start();
    expect(connectHttp).toHaveBeenCalledOnce();

    await registry.reload({ mem0: { url: "https://mem0.example/mcp" } });

    expect(connectHttp).toHaveBeenCalledOnce();
  });

  it("keeps failed and timed-out enabled servers in the authoritative catalog", async () => {
    const registry = new McpGatewayRegistry(
      {
        failed: { url: "https://failed.example/mcp" },
        timed: { url: "https://timed.example/mcp" },
      },
      undefined,
      {
        connectHttp: vi.fn(async (url: string) => {
          if (url.includes("timed")) return new Promise<never>(() => undefined);
          throw new Error("connection refused");
        }),
      } as never,
    );

    await registry.start(10);

    expect((registry as never as { getServerStatuses(): unknown }).getServerStatuses()).toEqual([
      {
        serverId: "failed",
        serverName: "failed",
        source: "local",
        toolCount: 0,
        discoveryState: "error",
        error: "connection refused",
      },
      {
        serverId: "timed",
        serverName: "timed",
        source: "local",
        toolCount: 0,
        discoveryState: "timeout",
        error: "startup timed out after 10ms",
      },
    ]);
  });

  it("replaces a previously healthy server with an explicit reload error status", async () => {
    const connectHttp = vi.fn()
      .mockResolvedValueOnce({
        listTools: async () => ({ tools: [{ name: "read", inputSchema: { type: "object" } }] }),
        callTool: vi.fn(),
        close: vi.fn(async () => undefined),
      })
      .mockRejectedValueOnce(new Error("reload connection refused"));
    const registry = new McpGatewayRegistry(
      { docs: { url: "https://docs.example/one" } },
      undefined,
      { connectHttp } as never,
    );
    await registry.start();

    await registry.reload({ docs: { url: "https://docs.example/two" } });

    expect(registry.getServerStatuses()).toEqual([{
      serverId: "docs",
      serverName: "docs",
      source: "local",
      toolCount: 0,
      discoveryState: "error",
      error: "reload connection refused",
    }]);
  });

  it("turns a timed-out reload into a timeout status instead of hanging", async () => {
    const connectHttp = vi.fn()
      .mockResolvedValueOnce({
        listTools: async () => ({ tools: [] }),
        callTool: vi.fn(),
        close: vi.fn(async () => undefined),
      })
      .mockImplementationOnce(async () => new Promise<never>(() => undefined));
    const registry = new McpGatewayRegistry(
      { docs: { url: "https://docs.example/one" } },
      undefined,
      { connectHttp } as never,
    );
    await registry.start();

    const reloaded = registry.reload({ docs: { url: "https://docs.example/two" } }, 10);
    const outcome = await Promise.race([
      reloaded.then(() => "settled" as const),
      new Promise<"hung">((resolve) => setTimeout(() => resolve("hung"), 50)),
    ]);

    expect(outcome).toBe("settled");
    expect(registry.getServerStatuses()).toMatchObject([{
      serverId: "docs",
      discoveryState: "timeout",
      error: "startup timed out after 10ms",
    }]);
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

  it("closes late-resolving HTTP connections after startup timeout without leaving unowned connections", async () => {
    let resolveLateConnect!: (conn: unknown) => void;
    const lateConnectPromise = new Promise<unknown>((resolve) => {
      resolveLateConnect = resolve;
    });
    const closeSpy = vi.fn(async () => undefined);
    const lateConnection = {
      listTools: async () => ({ tools: [{ name: "late_tool", inputSchema: { type: "object" } }] }),
      callTool: vi.fn(),
      close: closeSpy,
      getServerId: () => "late-server",
      getServerName: () => "late-server",
      getServerUrl: () => "https://late.example/mcp",
    };

    const connectHttp = vi.fn(async () => lateConnectPromise);
    const registry = new McpGatewayRegistry(
      { "late-server": { url: "https://late.example/mcp" } },
      undefined,
      { connectHttp } as never,
    );

    await registry.start(10);

    expect(registry.getServerStatuses()).toEqual([{
      serverId: "late-server",
      serverName: "late-server",
      source: "local",
      toolCount: 0,
      discoveryState: "timeout",
      error: "startup timed out after 10ms",
    }]);
    expect(closeSpy).not.toHaveBeenCalled();

    resolveLateConnect(lateConnection);
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(closeSpy).toHaveBeenCalledOnce();
    expect(registry.getLocalCatalog().servers).toHaveLength(0);
  });

  it("handles late-rejecting HTTP connection after startup timeout without unhandled rejection", async () => {
    let rejectLateConnect!: (err: Error) => void;
    const lateConnectPromise = new Promise<unknown>((_, reject) => {
      rejectLateConnect = reject;
    });
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on("unhandledRejection", onUnhandled);

    try {
      const connectHttp = vi.fn(async () => lateConnectPromise);
      const registry = new McpGatewayRegistry(
        { "late-server": { url: "https://late.example/mcp" } },
        undefined,
        { connectHttp } as never,
      );

      await registry.start(10);
      rejectLateConnect(new Error("late connection failure"));
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(unhandled).toEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });
});
