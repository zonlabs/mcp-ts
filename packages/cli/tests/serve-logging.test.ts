import { describe, expect, it } from "vitest";
import type { CatalogSnapshot } from "@mcp-ts/bridge-protocol";
import { describeRemoteCatalogChanges } from "../src/commands/serve.js";

function catalog(
  servers: Array<{ serverId: string; serverName: string; toolCount: number }>,
): CatalogSnapshot {
  return {
    servers: servers.map(({ serverId, serverName, toolCount }) => ({
      serverId,
      serverName,
      tools: Array.from({ length: toolCount }, (_, index) => ({
        name: `tool_${index + 1}`,
        inputSchema: { type: "object" },
      })),
    })),
  };
}

describe("verbose remote catalog logging", () => {
  it("reports named remote servers added and removed", () => {
    const previous = catalog([
      { serverId: "github", serverName: "Github - Personal", toolCount: 44 },
      { serverId: "chess", serverName: "Chess", toolCount: 3 },
    ]);
    const next = catalog([
      { serverId: "github", serverName: "Github - Personal", toolCount: 44 },
      { serverId: "stitch", serverName: "Stitch", toolCount: 15 },
    ]);

    expect(describeRemoteCatalogChanges(previous, next)).toEqual([
      "Remote server connected: Stitch (15 tools)",
      "Remote server disconnected: Chess (3 tools removed)",
    ]);
  });

  it("does not report unchanged servers", () => {
    const snapshot = catalog([
      { serverId: "github", serverName: "Github - Personal", toolCount: 44 },
    ]);

    expect(describeRemoteCatalogChanges(snapshot, snapshot)).toEqual([]);
  });
});
