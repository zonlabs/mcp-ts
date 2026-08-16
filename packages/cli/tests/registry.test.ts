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
      getServerId: () => "local:docs",
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
      serverId: "local:docs",
      serverName: "docs",
    }));
    expect(registry.getLocalCatalog().servers[0].tools[0].name).toBe("search_docs");
    await registry.close();
    expect(close).toHaveBeenCalledOnce();
  });
});
