import { describe, expect, it, vi } from "vitest";
import {
  createAuthenticatedRemoteClient,
  mergeSearchResults,
  resolveGateway,
} from "../src/gateway/command-resolution.js";

describe("one-shot command resolution", () => {
  it("probes the managed custom port before the default gateway", async () => {
    const probe = vi.fn(async (_host = "127.0.0.1", port = 8765) =>
      port === 9123 ? "http://127.0.0.1:9123/mcp" : null,
    );

    const result = await resolveGateway({
      readPid: () => ({ pid: 42, port: 9123, startedAt: 1 }),
      isAlive: () => true,
      findPortOwner: () => 42,
      probe,
    });

    expect(result).toMatchObject({
      endpoint: "http://127.0.0.1:9123/mcp",
      port: 9123,
      managed: true,
      state: "running",
    });
    expect(probe).toHaveBeenCalledTimes(1);
  });

  it("uses a refreshed bearer token for remote HTTP without exposing it", async () => {
    const connect = vi.fn(async () => ({ close: vi.fn() }));
    await createAuthenticatedRemoteClient("https://example.test", {
      loadSession: () => ({ accessToken: "old", refreshToken: "r", accessTokenExpiresAt: 1 }),
      refreshSession: async () => ({
        accessToken: "secret-token",
        refreshToken: "r2",
        accessTokenExpiresAt: Date.now() + 60_000,
      }),
      connect: connect as never,
    });

    expect(connect).toHaveBeenCalledWith("https://example.test/mcp", {
      headers: { Authorization: "Bearer secret-token" },
    });
  });

  it("returns null with an actionable warning when no remote session exists", async () => {
    const warn = vi.fn();
    const result = await createAuthenticatedRemoteClient("https://example.test", {
      loadSession: () => null,
      refreshSession: vi.fn(),
      connect: vi.fn(),
      warn,
    });

    expect(result).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("mcpa login"));
  });

  it("deduplicates canonical IDs and deterministically re-ranks merged search results", () => {
    const merged = mergeSearchResults("github issue", 2, [
      { toolId: "github::list_issues", serverId: "github", serverName: "GitHub", toolName: "list_issues", name: "list_issues", description: "List GitHub issues" },
      { toolId: "gitlab::list_issues", serverId: "gitlab", serverName: "GitLab", toolName: "list_issues", name: "list_issues", description: "List issues" },
    ], [
      { toolId: "github::list_issues", serverId: "github", serverName: "GitHub", toolName: "list_issues", name: "list_issues", description: "List GitHub issues" },
      { toolId: "github::create_issue", serverId: "github", serverName: "GitHub", toolName: "create_issue", name: "create_issue", description: "Create a GitHub issue" },
    ]);

    expect(merged.map((item) => item.toolId)).toEqual([
      "github::create_issue",
      "github::list_issues",
    ]);
  });
});
