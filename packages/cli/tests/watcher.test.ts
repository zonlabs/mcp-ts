import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test, afterEach } from "vitest";
import { McpGatewayRegistry } from "../src/gateway/registry.js";
import { McpConfigWatcher } from "../src/gateway/watcher.js";
import type { McpServerConfig } from "../src/gateway/types.js";

describe("McpGatewayRegistry hot-reloading & McpConfigWatcher", () => {
  let tempDir: string | null = null;
  let watcher: McpConfigWatcher | null = null;

  afterEach(() => {
    watcher?.stop();
    watcher = null;
    if (tempDir) {
      try {
        rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // Cleanup
      }
      tempDir = null;
    }
  });

  test("registry.reload adds, removes, and updates server routes on-the-fly", async () => {
    const mockHttp = async (url: string, opts: any) => ({
      listTools: async () => ({
        tools: [
          {
            name: `${opts.serverName}_query`,
            description: `Query tool for ${opts.serverName}`,
            inputSchema: { type: "object" },
          },
        ],
      }),
      callTool: async () => ({ status: "ok" }),
      close: async () => {},
    });

    const initialConfigs: Record<string, McpServerConfig> = {
      serverA: { url: "http://127.0.0.1:9001/mcp" },
      serverB: { url: "http://127.0.0.1:9002/mcp" },
    };

    const registry = new McpGatewayRegistry(initialConfigs, undefined, {
      connectHttp: mockHttp as any,
    });
    await registry.start();

    expect(registry.getLocalCatalog().servers.map((s) => s.serverName)).toEqual(["serverA", "serverB"]);
    expect(registry.aggregatedTools().map((t) => t.name)).toContain("serverA_query");
    expect(registry.aggregatedTools().map((t) => t.name)).toContain("serverB_query");

    // Hot-reload: remove serverA, keep serverB, add serverC
    const newConfigs: Record<string, McpServerConfig> = {
      serverB: { url: "http://127.0.0.1:9002/mcp" },
      serverC: { url: "http://127.0.0.1:9003/mcp" },
    };

    const result = await registry.reload(newConfigs);
    expect(result.removed).toEqual(["serverA"]);
    expect(result.added).toEqual(["serverC"]);

    const catalogAfter = registry.getLocalCatalog().servers.map((s) => s.serverName);
    expect(catalogAfter).toContain("serverB");
    expect(catalogAfter).toContain("serverC");
    expect(catalogAfter).not.toContain("serverA");

    expect(registry.aggregatedTools().map((t) => t.name)).not.toContain("serverA_query");
    expect(registry.aggregatedTools().map((t) => t.name)).toContain("serverC_query");

    await registry.close();
  });

  test("McpConfigWatcher detects file writes and fires debounced reload callback", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "mcpa-watcher-test-"));
    const configPath = join(tempDir, "mcp.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        mcpServers: {
          testServer: { url: "http://127.0.0.1:9000/mcp" },
        },
      }),
      "utf8",
    );

    let reloadedConfig: any = null;
    const reloadedPromise = new Promise<void>((resolve) => {
      watcher = new McpConfigWatcher(
        tempDir!,
        (cfg) => {
          reloadedConfig = cfg;
          resolve();
        },
        { debounceMs: 50 },
      );
      watcher.start();
    });

    // Write updated config
    writeFileSync(
      configPath,
      JSON.stringify({
        mcpServers: {
          testServer: { url: "http://127.0.0.1:9000/mcp" },
          addedServer: { url: "http://127.0.0.1:9001/mcp" },
        },
      }),
      "utf8",
    );

    await reloadedPromise;
    expect(reloadedConfig).toBeDefined();
    expect(reloadedConfig.mcpServers).toHaveProperty("addedServer");
  });
});
