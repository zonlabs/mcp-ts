import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { exec } from "node:child_process";
import { loadState, saveState, stateFilePath } from "./config.js";

const DEFAULT_CALLBACK_PORT = 43110;
const DEFAULT_LOGIN_BASE_URL = "https://mcp-assistant.in";

function base64url(input: Buffer): string {
  return input.toString("base64url");
}

function openBrowser(url: string): void {
  const platform = process.platform;
  if (platform === "win32") {
    exec(`start "" "${url}"`);
  } else if (platform === "darwin") {
    exec(`open "${url}"`);
  } else {
    exec(`xdg-open "${url}"`);
  }
}

export interface LinkResult {
  token: string;
  tokenExpiresAt: number;
}

/**
 * Pair this machine with a remote gateway by signing in on the login app
 * (mcp-assistant.in — the same Supabase identity used by mcp-client).
 *
 * The browser opens the login app's OAuth bounce route; after the user signs
 * in, that route redirects to a loopback URL with the Supabase access token.
 * `link` captures it and stores it as the device credential.
 */
export async function linkToRemote(
  remote: string,
  deviceId: string,
  dir?: string,
  loginBase: string = process.env.LOGIN_BASE_URL || DEFAULT_LOGIN_BASE_URL,
): Promise<LinkResult> {
  const cwd = dir ?? process.cwd();
  const state = loadState(cwd);
  const port = DEFAULT_CALLBACK_PORT;
  const redirectUri = `http://127.0.0.1:${port}/callback`;
  const stateParam = base64url(randomBytes(16));

  // Loopback HTTP server that captures the token from the redirect.
  const server = createServer((req, res) => {
    const reqUrl = new URL(req.url ?? "/", `http://${req.headers.host ?? "127.0.0.1"}`);
    if (reqUrl.pathname !== "/callback") {
      res.writeHead(404).end("Not found");
      return;
    }
    res.writeHead(200, { "content-type": "text/html" });
    res.end(
      "<html><body><h2>Device linked!</h2><p>You can close this window and return to the terminal.</p></body></html>",
    );
    server.close();
    const token = reqUrl.searchParams.get("supabase_token") ?? "";
    const st = reqUrl.searchParams.get("state") ?? "";
    resolve({ token, state: st });
  });
  server.listen(port, "127.0.0.1");

  let resolve!: (v: { token: string; state: string }) => void;
  const gotToken = new Promise<{ token: string; state: string }>((r) => (resolve = r));
  const closeServer = () => {
    server.close();
  };

  const bounce = new URL("/auth/gateway", loginBase.replace(/\/$/, ""));
  bounce.searchParams.set("next", `${redirectUri}?state=${stateParam}`);

  console.log(`Opening browser for sign-in…`);
  console.log(`If the browser does not open, visit:\n  ${bounce}\n`);
  openBrowser(bounce.toString());

  const result = await Promise.race([
    gotToken,
    once(server, "error").then(() => Promise.reject(new Error("callback server error"))),
  ]);

  if (result.state !== stateParam) {
    closeServer();
    throw new Error("State mismatch in authorization callback");
  }
  if (!result.token) {
    closeServer();
    throw new Error("No Supabase token returned from sign-in");
  }

  const tokenExpiresAt = Date.now() + 3600 * 1000;
  saveState({ ...state, remote, deviceId, token: result.token, tokenExpiresAt }, cwd);
  closeServer();
  console.log(`Linked device ${deviceId} with ${remote}`);
  console.log(`State saved to: ${stateFilePath(cwd)}`);
  return { token: result.token, tokenExpiresAt };
}

/**
 * Returns the current stored token (mcp-ts/mcp validates Supabase JWTs
 * directly; re-run `link` if the token has expired).
 */
export async function refreshTokenIfNeeded(dir?: string): Promise<{
  token: string;
  tokenExpiresAt: number;
}> {
  const cwd = dir ?? process.cwd();
  const state = loadState(cwd);
  return {
    token: state.token ?? "",
    tokenExpiresAt: state.tokenExpiresAt ?? 0,
  };
}
