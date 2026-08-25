import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const oauthMocks = vi.hoisted(() => ({
  createServer: vi.fn(() => {
    throw new Error("callback server should not be created for a reusable session");
  }),
  execFile: vi.fn(() => {
    throw new Error("browser should not open for a reusable session");
  }),
}));

vi.mock("node:http", () => ({ createServer: oauthMocks.createServer }));
vi.mock("node:child_process", () => ({ execFile: oauthMocks.execFile }));

import {
  InvalidAuthSessionError,
  saveAuthSession,
  type AuthSession,
} from "../src/gateway/auth-store.js";
import { loginToRemote, reuseSavedAuthSession } from "../src/gateway/oauth.js";

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

describe("loginToRemote", () => {
  const originalConfigDir = process.env.MCPA_CONFIG_DIR;
  let configDir: string;

  beforeEach(() => {
    configDir = mkdtempSync(join(tmpdir(), "mcp-ts-oauth-"));
    process.env.MCPA_CONFIG_DIR = configDir;
    oauthMocks.createServer.mockClear();
    oauthMocks.execFile.mockClear();
  });

  afterEach(() => {
    rmSync(configDir, { recursive: true, force: true });
    if (originalConfigDir === undefined) delete process.env.MCPA_CONFIG_DIR;
    else process.env.MCPA_CONFIG_DIR = originalConfigDir;
  });

  it("reports that a reusable session was already signed in before browser work", async () => {
    saveAuthSession("https://remote.example/mcp", session);

    await expect(loginToRemote("https://remote.example/mcp")).resolves.toEqual({
      ...session,
      alreadySignedIn: true,
    });
    expect(oauthMocks.createServer).not.toHaveBeenCalled();
    expect(oauthMocks.execFile).not.toHaveBeenCalled();
  });
});
