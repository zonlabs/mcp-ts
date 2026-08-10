import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockSupabaseFrom } = vi.hoisted(() => ({
  mockSupabaseFrom: vi.fn(),
}));

vi.mock("../../src/db/supabase", () => ({
  supabase: { from: mockSupabaseFrom },
}));

describe("mcp tool call analytics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("records a successful tool call with normalized app metadata", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    mockSupabaseFrom.mockReturnValue({ insert });
    const { recordMcpToolCallEvent } = await import("../../src/core/analytics");

    await recordMcpToolCallEvent({
      userId: "user-1",
      requestId: "req-1",
      mcpSessionId: "mcp-session-1",
      serverId: "github-prod",
      serverName: "GitHub",
      toolName: "search_issues",
      status: "success",
      eventType: "downstream_tool",
      startedAt: new Date("2026-06-16T00:00:00.000Z"),
      completedAt: new Date("2026-06-16T00:00:00.125Z"),
      durationMs: 125,
    });

    expect(mockSupabaseFrom).toHaveBeenCalledWith("mcp_tool_call_events");
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-1",
        request_id: "req-1",
        mcp_session_id: "mcp-session-1",
        server_id: "github-prod",
        server_name: "GitHub",
        app_key: "github",
        tool_name: "search_issues",
        status: "success",
        event_type: "downstream_tool",
        duration_ms: 125,
      })
    );
  });

  it("records errors with a short sanitized preview", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    mockSupabaseFrom.mockReturnValue({ insert });
    const { recordMcpToolCallEvent } = await import("../../src/core/analytics");

    await recordMcpToolCallEvent({
      userId: "user-1",
      requestId: "req-1",
      toolName: "send_email",
      status: "error",
      error: new Error("Authorization: Bearer secret-token\nRequest failed"),
      startedAt: new Date("2026-06-16T00:00:00.000Z"),
      completedAt: new Date("2026-06-16T00:00:00.010Z"),
      durationMs: 10,
    });

    const payload = insert.mock.calls[0][0];
    expect(payload.error_code).toBe("ERROR");
    expect(payload.error_preview).toContain("[redacted]");
    expect(payload.error_preview).not.toContain("secret-token");
    expect(payload.error_preview.length).toBeLessThanOrEqual(240);
  });

  it("includes server_url in the insert payload when serverUrl is provided", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    mockSupabaseFrom.mockReturnValue({ insert });
    const { recordMcpToolCallEvent } = await import("../../src/core/analytics");

    await recordMcpToolCallEvent({
      userId: "user-1",
      requestId: "req-1",
      serverId: "github-prod",
      serverName: "GitHub",
      serverUrl: "https://github.com",
      toolName: "search_issues",
      status: "success",
      startedAt: new Date("2026-06-16T00:00:00.000Z"),
      completedAt: new Date("2026-06-16T00:00:00.125Z"),
      durationMs: 125,
    });

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        server_url: "https://github.com",
      })
    );
  });

  it("does not throw when Supabase insert fails", async () => {
    const insert = vi.fn().mockResolvedValue({ error: { message: "db unavailable" } });
    mockSupabaseFrom.mockReturnValue({ insert });
    const { recordMcpToolCallEvent } = await import("../../src/core/analytics");

    await expect(
      recordMcpToolCallEvent({
        userId: "user-1",
        requestId: "req-1",
        toolName: "search",
        status: "success",
        startedAt: new Date("2026-06-16T00:00:00.000Z"),
        completedAt: new Date("2026-06-16T00:00:00.001Z"),
        durationMs: 1,
      })
    ).resolves.toBeUndefined();
  });
});
