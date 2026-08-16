import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizeAuthSession, oauthCodeRoutes } from "../../src/routes/oauth-codes";

afterEach(() => vi.unstubAllGlobals());

describe("OAuth session normalization", () => {
  it("returns the complete camelCase CLI session", () => {
    expect(
      normalizeAuthSession({
        access_token: "access",
        refresh_token: "refresh",
        expires_at: 1_800_000_000,
      }),
    ).toEqual({
      accessToken: "access",
      refreshToken: "refresh",
      accessTokenExpiresAt: 1_800_000_000_000,
    });
  });

  it("requires both access and refresh credentials", () => {
    expect(() => normalizeAuthSession({ access_token: "access" })).toThrow(
      "complete authentication session",
    );
  });

  it("returns and rotates the complete refresh session", async () => {
    process.env.SUPABASE_ANON_KEY = "anon";
    const fetchMock = vi.fn(async () =>
      Response.json({
        access_token: "access-two",
        refresh_token: "refresh-two",
        expires_at: 1_900_000_000,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await oauthCodeRoutes.request("http://worker/token/refresh", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken: "refresh-one" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      accessToken: "access-two",
      refreshToken: "refresh-two",
      accessTokenExpiresAt: 1_900_000_000_000,
    });
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      refresh_token: "refresh-one",
    });
  });
});
