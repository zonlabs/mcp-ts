import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface UserInfo {
  email?: string;
  name?: string;
  [key: string]: unknown;
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: number;
  userInfo?: UserInfo;
  user?: UserInfo;
  email?: string;
}

export function extractUserInfo(session?: AuthSession | null): UserInfo | undefined {
  if (!session) return undefined;
  let email = session.userInfo?.email ?? session.user?.email ?? session.email;
  let name = session.userInfo?.name ?? session.user?.name;

  if (typeof session.accessToken === "string") {
    try {
      const parts = session.accessToken.split(".");
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
        if (!email) {
          if (typeof payload.email === "string") email = payload.email;
          else if (typeof payload.user_email === "string") email = payload.user_email;
          else if (typeof payload.preferred_username === "string") email = payload.preferred_username;
          else if (typeof payload.sub === "string" && payload.sub.includes("@")) email = payload.sub;
        }
        if (!name && typeof payload.name === "string") {
          name = payload.name;
        }
      }
    } catch {
      // Access token is not a base64url JSON JWT
    }
  }

  if (email || name || session.userInfo || session.user) {
    return {
      ...(session.user ?? {}),
      ...(session.userInfo ?? {}),
      ...(email ? { email } : {}),
      ...(name ? { name } : {}),
    };
  }
  return undefined;
}

export function extractUserEmail(session?: AuthSession | null): string | undefined {
  return extractUserInfo(session)?.email;
}

export class InvalidAuthSessionError extends Error {
  constructor() {
    super("Saved sign-in has expired. Run mcpa login again.");
    this.name = "InvalidAuthSessionError";
  }
}

interface AuthFile {
  version: 1;
  sessions: Record<string, AuthSession>;
}

interface StoreOptions {
  configDir?: string;
}

interface RefreshOptions extends StoreOptions {
  now?: () => number;
  fetchImpl?: typeof fetch;
}

export function normalizeRemoteOrigin(remote: string): string {
  return new URL(remote).origin;
}

export function authConfigDir(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  userHome: string = homedir(),
): string {
  if (env.MCPA_CONFIG_DIR) return env.MCPA_CONFIG_DIR;
  if (platform === "win32") {
    return join(env.LOCALAPPDATA ?? join(userHome, "AppData", "Local"), "mcp-assistant");
  }
  if (platform === "darwin") {
    return join(userHome, "Library", "Application Support", "mcp-assistant");
  }
  return join(env.XDG_CONFIG_HOME ?? join(userHome, ".config"), "mcp-assistant");
}

import { AUTH_FILENAME } from "../constants.js";

export function authFilePath(options: StoreOptions = {}): string {
  return join(options.configDir ?? authConfigDir(), AUTH_FILENAME);
}

function readAuthFile(options: StoreOptions): AuthFile {
  const path = authFilePath(options);
  if (!existsSync(path)) return { version: 1, sessions: {} };
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<AuthFile>;
    return parsed.version === 1 && parsed.sessions
      ? { version: 1, sessions: parsed.sessions }
      : { version: 1, sessions: {} };
  } catch {
    return { version: 1, sessions: {} };
  }
}

function writeAuthFile(value: AuthFile, options: StoreOptions): void {
  const path = authFilePath(options);
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, JSON.stringify(value, null, 2), { mode: 0o600 });
    renameSync(temporary, path);
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}

export function loadAuthSession(remote: string, options: StoreOptions = {}): AuthSession | null {
  return readAuthFile(options).sessions[normalizeRemoteOrigin(remote)] ?? null;
}

export function saveAuthSession(
  remote: string,
  session: AuthSession,
  options: StoreOptions = {},
): void {
  const auth = readAuthFile(options);
  auth.sessions[normalizeRemoteOrigin(remote)] = session;
  writeAuthFile(auth, options);
}

export function clearAuthSession(remote: string, options: StoreOptions = {}): void {
  const auth = readAuthFile(options);
  delete auth.sessions[normalizeRemoteOrigin(remote)];
  writeAuthFile(auth, options);
}

export async function ensureFreshAuthSession(
  remote: string,
  options: RefreshOptions = {},
): Promise<AuthSession> {
  const session = loadAuthSession(remote, options);
  if (!session) throw new Error("Not signed in. Run mcpa login first.");
  const now = options.now?.() ?? Date.now();
  if (session.accessTokenExpiresAt - now > 60_000) return session;

  const origin = normalizeRemoteOrigin(remote);
  const response = await (options.fetchImpl ?? fetch)(`${origin}/oauth/token/refresh`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refreshToken: session.refreshToken }),
  });
  const payload = (await response.json().catch(() => null)) as AuthSession | null;
  if (!response.ok) {
    if (response.status === 400 || response.status === 401) throw new InvalidAuthSessionError();
    throw new Error(`Could not refresh the remote session (${response.status})`);
  }
  if (
    !payload ||
    typeof payload.accessToken !== "string" ||
    typeof payload.refreshToken !== "string" ||
    typeof payload.accessTokenExpiresAt !== "number"
  ) {
    throw new InvalidAuthSessionError();
  }
  saveAuthSession(origin, payload, options);
  return payload;
}
