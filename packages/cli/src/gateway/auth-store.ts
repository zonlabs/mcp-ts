import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: number;
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

export function authFilePath(options: StoreOptions = {}): string {
  return join(options.configDir ?? authConfigDir(), "auth.json");
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
