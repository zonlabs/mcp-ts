import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  clearAuthSession,
  ensureFreshAuthSession,
  extractUserEmail,
  extractUserInfo,
  InvalidAuthSessionError,
  loadAuthSession,
  normalizeRemoteOrigin,
  saveAuthSession,
  type AuthSession,
  type UserInfo,
} from "../src/gateway/auth-store.js";

function tempConfigDir(): string {
  return mkdtempSync(join(tmpdir(), "mcpa-auth-"));
}

const session: AuthSession = {
  accessToken: "access-one",
  refreshToken: "refresh-one",
  accessTokenExpiresAt: 2_000_000,
};

describe("global auth session store", () => {
  it("normalizes sessions by remote origin", () => {
    expect(normalizeRemoteOrigin("https://api.mcp-assistant.in/mcp?q=1")).toBe(
      "https://api.mcp-assistant.in",
    );
  });

  it("saves, loads, and clears a session outside project configuration", () => {
    const configDir = tempConfigDir();
    saveAuthSession("https://api.mcp-assistant.in", session, { configDir });

    expect(loadAuthSession("https://api.mcp-assistant.in/mcp", { configDir })).toEqual(session);
    expect(JSON.parse(readFileSync(join(configDir, "auth.json"), "utf8"))).toEqual({
      version: 1,
      sessions: { "https://api.mcp-assistant.in": session },
    });
    expect(readdirSync(configDir).filter((name) => name.endsWith(".tmp"))).toEqual([]);

    clearAuthSession("https://api.mcp-assistant.in", { configDir });
    expect(loadAuthSession("https://api.mcp-assistant.in", { configDir })).toBeNull();
  });

  it("refreshes and persists rotated credentials near expiry", async () => {
    const configDir = tempConfigDir();
    saveAuthSession("https://api.mcp-assistant.in", session, { configDir });
    const requests: Array<{ url: string; init?: RequestInit }> = [];

    const fresh = await ensureFreshAuthSession("https://api.mcp-assistant.in", {
      configDir,
      now: () => 1_950_001,
      fetchImpl: async (url, init) => {
        requests.push({ url: String(url), init });
        return Response.json({
          accessToken: "access-two",
          refreshToken: "refresh-two",
          accessTokenExpiresAt: 4_000_000,
        });
      },
    });

    expect(fresh).toEqual({
      accessToken: "access-two",
      refreshToken: "refresh-two",
      accessTokenExpiresAt: 4_000_000,
    });
    expect(loadAuthSession("https://api.mcp-assistant.in", { configDir })).toEqual(fresh);
    expect(requests[0]?.url).toBe("https://api.mcp-assistant.in/oauth/token/refresh");
    expect(JSON.parse(String(requests[0]?.init?.body))).toEqual({ refreshToken: "refresh-one" });
  });

  it("does not refresh a session with more than 60 seconds remaining", async () => {
    const configDir = tempConfigDir();
    saveAuthSession("https://api.mcp-assistant.in", session, { configDir });
    let called = false;

    const fresh = await ensureFreshAuthSession("https://api.mcp-assistant.in", {
      configDir,
      now: () => 1_000_000,
      fetchImpl: async () => {
        called = true;
        return new Response(null, { status: 500 });
      },
    });

    expect(fresh).toEqual(session);
    expect(called).toBe(false);
  });

  it("distinguishes invalid refresh credentials from transient failures", async () => {
    const configDir = tempConfigDir();
    saveAuthSession("https://api.mcp-assistant.in", session, { configDir });

    await expect(
      ensureFreshAuthSession("https://api.mcp-assistant.in", {
        configDir,
        now: () => 1_950_001,
        fetchImpl: async () => Response.json({ error: "invalid" }, { status: 401 }),
      }),
    ).rejects.toBeInstanceOf(InvalidAuthSessionError);

    await expect(
      ensureFreshAuthSession("https://api.mcp-assistant.in", {
        configDir,
        now: () => 1_950_001,
        fetchImpl: async () => Response.json({ error: "down" }, { status: 503 }),
      }),
    ).rejects.not.toBeInstanceOf(InvalidAuthSessionError);
  });

  it("extracts UserInfo from explicit property, user object, or JWT payload", () => {
    // 1. Direct email field
    expect(extractUserInfo({ ...session, email: "alice@example.com" })).toEqual({
      email: "alice@example.com",
    });

    // 2. Nested user / userInfo object
    expect(extractUserInfo({ ...session, userInfo: { email: "bob@example.com", name: "Bob" } })).toEqual({
      email: "bob@example.com",
      name: "Bob",
    });

    // 3. JWT token payload
    const payload = Buffer.from(JSON.stringify({ email: "carol@example.com", name: "Carol" })).toString("base64url");
    const jwtSession: AuthSession = {
      ...session,
      accessToken: `header.${payload}.signature`,
    };
    expect(extractUserInfo(jwtSession)).toEqual({
      email: "carol@example.com",
      name: "Carol",
    });
    expect(extractUserEmail(jwtSession)).toBe("carol@example.com");

    // 4. Undefined / non-JWT
    expect(extractUserInfo(session)).toBeUndefined();
    expect(extractUserInfo(null)).toBeUndefined();
  });
});
