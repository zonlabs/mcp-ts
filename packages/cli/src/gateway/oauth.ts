import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { execFile } from "node:child_process";
import {
  authFilePath,
  clearAuthSession,
  ensureFreshAuthSession,
  extractUserInfo,
  InvalidAuthSessionError,
  loadAuthSession,
  normalizeRemoteOrigin,
  saveAuthSession,
  type AuthSession,
} from "./auth-store.js";
import { info, success, treeNote, pc } from "../ux.js";
import { DEFAULT_OAUTH_CALLBACK_PORT } from "../constants.js";

function openBrowser(url: string): void {
  if (process.platform === "win32") execFile("rundll32", ["url.dll,FileProtocolHandler", url]);
  else if (process.platform === "darwin") execFile("open", [url]);
  else execFile("xdg-open", [url]);
}

interface SavedSessionDependencies {
  load?: typeof loadAuthSession;
  ensureFresh?: typeof ensureFreshAuthSession;
}

export interface LoginResult extends AuthSession {
  alreadySignedIn: boolean;
}

export async function reuseSavedAuthSession(
  remote: string,
  dependencies: SavedSessionDependencies = {},
): Promise<AuthSession | null> {
  const load = dependencies.load ?? loadAuthSession;
  if (!load(remote)) return null;
  try {
    return await (dependencies.ensureFresh ?? ensureFreshAuthSession)(remote);
  } catch (error) {
    if (error instanceof InvalidAuthSessionError) return null;
    throw error;
  }
}

function reportSignedIn(remote: string, session: AuthSession): void {
  const userInfo = extractUserInfo(session);
  const origin = normalizeRemoteOrigin(remote);
  if (userInfo?.email) {
    success(`Signed in as ${pc.bold(userInfo.email)} (${origin})`);
  } else {
    success(`Signed in to ${origin}`);
  }
  treeNote(pc.dim(`Auth state saved to ${authFilePath()}`));
}

export async function loginToRemote(
  remote: string,
): Promise<LoginResult> {
  const savedSession = await reuseSavedAuthSession(remote);
  if (savedSession) {
    return { ...savedSession, alreadySignedIn: true };
  }
  const authOrigin = normalizeRemoteOrigin(remote);
  const callbackUrl = `http://127.0.0.1:${DEFAULT_OAUTH_CALLBACK_PORT}/callback`;
  const state = randomBytes(16).toString("base64url");
  let resolveCallback!: (value: { code: string; state: string }) => void;
  const callback = new Promise<{ code: string; state: string }>((resolve) => {
    resolveCallback = resolve;
  });
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`);
    if (url.pathname !== "/callback") {
      response.writeHead(404).end("Not found");
      return;
    }
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end("<!doctype html><title>MCP Assistant</title><p>Login successful. You can close this tab.</p>");
    resolveCallback({ code: url.searchParams.get("code") ?? "", state: url.searchParams.get("state") ?? "" });
  });
  server.listen(DEFAULT_OAUTH_CALLBACK_PORT, "127.0.0.1");

  const loginUrl = new URL("/oauth/login", authOrigin.replace(/\/$/, ""));
  loginUrl.searchParams.set("next", `${callbackUrl}?state=${state}`);
  info("Opening browser for sign-in...");
  treeNote([pc.dim("If the browser does not open, visit:"), pc.underline(pc.cyan(loginUrl.toString()))]);
  openBrowser(loginUrl.toString());

  try {
    const result = await Promise.race([
      callback,
      once(server, "error").then(() => Promise.reject(new Error("callback server error"))),
    ]);
    if (result.state !== state) throw new Error("State mismatch in authorization callback");
    if (!result.code) throw new Error("No authorization code returned from sign-in");

    const response = await fetch(`${authOrigin.replace(/\/$/, "")}/oauth/codes/exchange`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: result.code }),
    });
    const session = (await response.json().catch(() => null)) as AuthSession | null;
    if (!response.ok || !session?.accessToken || !session.refreshToken) {
      throw new Error(`Code exchange failed (${response.status})`);
    }
    const userInfo = extractUserInfo(session);
    if (userInfo) {
      session.userInfo = userInfo;
    }
    saveAuthSession(remote, session);
    reportSignedIn(remote, session);
    return { ...session, alreadySignedIn: false };
  } finally {
    server.close();
  }
}

export async function logoutFromRemote(remote: string): Promise<void> {
  const session = loadAuthSession(remote);
  const userInfo = extractUserInfo(session);
  try {
    if (session) {
      await fetch(`${normalizeRemoteOrigin(remote)}/oauth/logout`, {
        method: "POST",
        headers: { authorization: `Bearer ${session.accessToken}`, "content-type": "application/json" },
        body: JSON.stringify({ refreshToken: session.refreshToken }),
      });
    }
  } finally {
    clearAuthSession(remote);
    const origin = normalizeRemoteOrigin(remote);
    if (userInfo?.email) {
      success(`Logged out ${pc.bold(userInfo.email)} from ${origin}`);
    } else {
      success(`Logged out from ${origin}`);
    }
  }
}
