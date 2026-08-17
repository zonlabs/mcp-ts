import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { webhookRoutes } from "../../src/routes/webhooks";

describe("webhookRoutes", () => {
  let app: Hono;
  const mockRefreshRemoteCatalog = vi.fn();
  const mockGet = vi.fn();
  const mockIdFromName = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockRefreshRemoteCatalog.mockResolvedValue(undefined);
    mockGet.mockReturnValue({
      refreshRemoteCatalog: mockRefreshRemoteCatalog,
    });
    mockIdFromName.mockImplementation((name: string) => `do_id_${name}`);

    app = new Hono();
    app.route("/internal/webhooks", webhookRoutes);
  });

  it("rejects unauthorized requests when secret does not match", async () => {
    const res = await app.request(
      "http://127.0.0.1:8787/internal/webhooks/supabase",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-webhook-secret": "wrong-secret",
        },
        body: JSON.stringify({ type: "INSERT", table: "mcp_servers" }),
      },
      {
        SUPABASE_WEBHOOK_SECRET: "correct-secret",
      },
    );

    expect(res.status).toBe(401);
  });

  it("accepts valid webhook and triggers refresh on BridgeSession DO", async () => {
    const res = await app.request(
      "http://127.0.0.1:8787/internal/webhooks/supabase",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-webhook-secret": "correct-secret",
        },
        body: JSON.stringify({
          type: "INSERT",
          table: "mcp_servers",
          record: { id: "srv-1", user_id: "user-abc" },
        }),
      },
      {
        SUPABASE_WEBHOOK_SECRET: "correct-secret",
        BRIDGE_SESSION: {
          idFromName: mockIdFromName,
          get: mockGet,
        },
      },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, userId: "user-abc" });
    expect(mockIdFromName).toHaveBeenCalledWith("user-abc");
    expect(mockRefreshRemoteCatalog).toHaveBeenCalled();
  });

  it("handles DELETE events using old_record user_id", async () => {
    const res = await app.request(
      "http://127.0.0.1:8787/internal/webhooks/supabase",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-webhook-secret": "correct-secret",
        },
        body: JSON.stringify({
          type: "DELETE",
          table: "mcp_servers",
          record: null,
          old_record: { id: "srv-1", user_id: "user-xyz" },
        }),
      },
      {
        SUPABASE_WEBHOOK_SECRET: "correct-secret",
        BRIDGE_SESSION: {
          idFromName: mockIdFromName,
          get: mockGet,
        },
      },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, userId: "user-xyz" });
    expect(mockIdFromName).toHaveBeenCalledWith("user-xyz");
    expect(mockRefreshRemoteCatalog).toHaveBeenCalled();
  });
});
