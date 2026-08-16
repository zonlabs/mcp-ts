import { afterEach, describe, expect, it, vi } from "vitest";

const resolveCredentialAndScopes = vi.fn(async () => ({ userId: "user-1", scopes: [] }));
vi.mock("../../src/core/auth", () => ({ resolveCredentialAndScopes }));

afterEach(() => vi.unstubAllGlobals());

describe("CLI session logout", () => {
  it("revokes only the current session and disconnects its account bridge", async () => {
    process.env.SUPABASE_ANON_KEY = "anon";
    const revoke = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", revoke);
    const disconnect = vi.fn(async () => undefined);
    const namespace = {
      idFromName: vi.fn((name: string) => name),
      get: vi.fn(() => ({ disconnect })),
    };
    const { oauthCodeRoutes } = await import("../../src/routes/oauth-codes");

    const response = await oauthCodeRoutes.request(
      "http://worker/logout",
      { method: "POST", headers: { authorization: "Bearer access-one" } },
      { BRIDGE_SESSION: namespace },
    );

    expect(response.status).toBe(204);
    expect(revoke.mock.calls[0][0]).toContain("/auth/v1/logout?scope=local");
    expect(disconnect).toHaveBeenCalledOnce();
  });
});
