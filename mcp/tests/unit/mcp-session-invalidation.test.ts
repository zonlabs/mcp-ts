import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockInvalidate,
  mockChannelOn,
  mockChannelSubscribe,
  mockRemoveChannel,
  mockSupabaseChannel,
  mockRegistryInvalidate,
  mockRegistryInvalidateAll,
  mockRemoveCachedSession,
} = vi.hoisted(() => ({
  mockInvalidate: vi.fn(),
  mockChannelOn: vi.fn(),
  mockChannelSubscribe: vi.fn(),
  mockRemoveChannel: vi.fn(),
  mockSupabaseChannel: vi.fn(),
  mockRegistryInvalidate: vi.fn(),
  mockRegistryInvalidateAll: vi.fn(),
  mockRemoveCachedSession: vi.fn(),
}));

vi.mock("../../src/db/supabase", () => ({
  supabase: {
    channel: mockSupabaseChannel,
    removeChannel: mockRemoveChannel,
  },
}));

vi.mock("../../src/core/multi-session-client-registry", () => ({
  invalidateMultiSessionClient: mockRegistryInvalidate,
  invalidateAllMultiSessionClients: mockRegistryInvalidateAll,
  removeCachedSession: mockRemoveCachedSession,
}));

describe("mcp-session invalidation bridge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockRemoveCachedSession.mockResolvedValue(undefined);

    mockChannelOn.mockImplementation(function (_event, _filter, callback) {
      (this as { callback?: Function }).callback = callback;
      return this;
    });
    mockChannelSubscribe.mockImplementation(function () {
      return this;
    });
    mockRemoveChannel.mockResolvedValue("ok");
    mockSupabaseChannel.mockImplementation(() => ({
      on: mockChannelOn,
      subscribe: mockChannelSubscribe,
    }));
  });

  afterEach(async () => {
    const { stopSessionInvalidationForTests } =
      await import("../../src/core/mcp-session-invalidation");
    await stopSessionInvalidationForTests();
    vi.useRealTimers();
  });

  it("subscribes to mcp_sessions changes and invalidates the user from a new row", async () => {
    const { createMcpSessionInvalidationBridge } =
      await import("../../src/core/mcp-session-invalidation");

    const bridge = createMcpSessionInvalidationBridge({
      supabase: {
        channel: mockSupabaseChannel,
        removeChannel: mockRemoveChannel,
      } as never,
      invalidateUser: mockInvalidate,
      debounceMs: 10,
    });

    bridge.start();

    expect(mockSupabaseChannel).toHaveBeenCalledWith("workflow-mcp-sessions");
    expect(mockChannelOn).toHaveBeenCalledWith(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "mcp_sessions",
      },
      expect.any(Function)
    );

    const callback = mockChannelOn.mock.calls[0]?.[2] as Function;
    callback({ new: { user_id: "user-123", status: "active" } });

    await vi.advanceTimersByTimeAsync(10);

    expect(mockInvalidate).toHaveBeenCalledWith("user-123");
  });

  it("falls back to old row user_id for delete-like events and debounces duplicate notifications", async () => {
    const { createMcpSessionInvalidationBridge } =
      await import("../../src/core/mcp-session-invalidation");

    const bridge = createMcpSessionInvalidationBridge({
      supabase: {
        channel: mockSupabaseChannel,
        removeChannel: mockRemoveChannel,
      } as never,
      invalidateUser: mockInvalidate,
      debounceMs: 25,
    });

    bridge.start();

    const callback = mockChannelOn.mock.calls[0]?.[2] as Function;
    callback({ old: { user_id: "user-456" } });
    callback({ new: { user_id: "user-456" } });

    await vi.advanceTimersByTimeAsync(25);

    expect(mockInvalidate).toHaveBeenCalledTimes(1);
    expect(mockInvalidate).toHaveBeenCalledWith("user-456");
  });

  it("resolves DELETE events using mapped UUID to invoke removeCachedSession", async () => {
    const { createMcpSessionInvalidationBridge } =
      await import("../../src/core/mcp-session-invalidation");

    const bridge = createMcpSessionInvalidationBridge({
      supabase: {
        channel: mockSupabaseChannel,
        removeChannel: mockRemoveChannel,
      } as never,
      invalidateUser: mockInvalidate,
      debounceMs: 10,
    });

    bridge.start();

    const callback = mockChannelOn.mock.calls[0]?.[2] as Function;

    // 1. Populate the map via INSERT
    callback({
      eventType: "INSERT",
      new: { id: "uuid-999", user_id: "user-abc", session_id: "sess-abc" },
    });

    // 2. Trigger DELETE
    callback({
      eventType: "DELETE",
      old: { id: "uuid-999" },
    });

    expect(mockRemoveCachedSession).toHaveBeenCalledWith("user-abc", "sess-abc");
    expect(mockRegistryInvalidateAll).not.toHaveBeenCalled();
  });

  it("falls back to invalidateAllMultiSessionClients on DELETE with unmapped UUID", async () => {
    const { createMcpSessionInvalidationBridge } =
      await import("../../src/core/mcp-session-invalidation");

    const bridge = createMcpSessionInvalidationBridge({
      supabase: {
        channel: mockSupabaseChannel,
        removeChannel: mockRemoveChannel,
      } as never,
      invalidateUser: mockInvalidate,
      debounceMs: 10,
    });

    bridge.start();

    const callback = mockChannelOn.mock.calls[0]?.[2] as Function;

    // Trigger DELETE with unmapped UUID
    callback({
      eventType: "DELETE",
      old: { id: "uuid-unmapped" },
    });

    expect(mockRemoveCachedSession).not.toHaveBeenCalled();
    expect(mockRegistryInvalidateAll).toHaveBeenCalledTimes(1);
  });

  it("skips invalidation for UPDATE heartbeat (status unchanged)", async () => {
    const { createMcpSessionInvalidationBridge } =
      await import("../../src/core/mcp-session-invalidation");

    const bridge = createMcpSessionInvalidationBridge({
      supabase: {
        channel: mockSupabaseChannel,
        removeChannel: mockRemoveChannel,
      } as never,
      invalidateUser: mockInvalidate,
      debounceMs: 10,
    });

    bridge.start();

    const callback = mockChannelOn.mock.calls[0]?.[2] as Function;
    callback({
      eventType: "UPDATE",
      new: { id: "uuid-1", user_id: "user-abc", status: "active" },
      old: { id: "uuid-1", user_id: "user-abc", status: "active" },
    });

    await vi.advanceTimersByTimeAsync(10);

    expect(mockInvalidate).not.toHaveBeenCalled();
  });

  it("invalidates for UPDATE when status changes to pending", async () => {
    const { createMcpSessionInvalidationBridge } =
      await import("../../src/core/mcp-session-invalidation");

    const bridge = createMcpSessionInvalidationBridge({
      supabase: {
        channel: mockSupabaseChannel,
        removeChannel: mockRemoveChannel,
      } as never,
      invalidateUser: mockInvalidate,
      debounceMs: 10,
    });

    bridge.start();

    const callback = mockChannelOn.mock.calls[0]?.[2] as Function;
    callback({
      eventType: "UPDATE",
      new: { id: "uuid-2", user_id: "user-abc", status: "pending" },
      old: { id: "uuid-2", user_id: "user-abc", status: "active" },
    });

    await vi.advanceTimersByTimeAsync(10);

    expect(mockInvalidate).toHaveBeenCalledWith("user-abc");
  });

  it("can be stopped and removes the realtime channel", async () => {
    const { createMcpSessionInvalidationBridge } =
      await import("../../src/core/mcp-session-invalidation");

    const bridge = createMcpSessionInvalidationBridge({
      supabase: {
        channel: mockSupabaseChannel,
        removeChannel: mockRemoveChannel,
      } as never,
      invalidateUser: mockInvalidate,
    });

    bridge.start();
    await bridge.stop();

    expect(mockRemoveChannel).toHaveBeenCalledTimes(1);
  });

});
