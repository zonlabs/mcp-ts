import { describe, expect, it, vi } from "vitest";
import { InvalidAuthSessionError, type AuthSession } from "../src/gateway/auth-store.js";
import { reuseSavedAuthSession } from "../src/gateway/oauth.js";

const session: AuthSession = {
  accessToken: "access-token",
  refreshToken: "refresh-token",
  accessTokenExpiresAt: Date.now() + 120_000,
};

describe("reuseSavedAuthSession", () => {
  it("returns a fresh or successfully refreshed saved session", async () => {
    const ensureFresh = vi.fn(async () => session);
    await expect(reuseSavedAuthSession("https://remote.example/mcp", {
      load: () => session,
      ensureFresh,
    })).resolves.toBe(session);
    expect(ensureFresh).toHaveBeenCalledWith("https://remote.example/mcp");
  });

  it("returns null when no saved session exists", async () => {
    const ensureFresh = vi.fn();
    await expect(reuseSavedAuthSession("https://remote.example", {
      load: () => null,
      ensureFresh,
    })).resolves.toBeNull();
    expect(ensureFresh).not.toHaveBeenCalled();
  });

  it("returns null when saved refresh credentials are invalid", async () => {
    await expect(reuseSavedAuthSession("https://remote.example", {
      load: () => session,
      ensureFresh: async () => { throw new InvalidAuthSessionError(); },
    })).resolves.toBeNull();
  });

  it("preserves transient refresh failures", async () => {
    await expect(reuseSavedAuthSession("https://remote.example", {
      load: () => session,
      ensureFresh: async () => { throw new Error("refresh service unavailable"); },
    })).rejects.toThrow("refresh service unavailable");
  });
});
