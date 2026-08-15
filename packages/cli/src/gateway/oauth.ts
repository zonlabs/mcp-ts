import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { exec } from "node:child_process";
import { loadState, saveState, stateFilePath } from "./config.js";
import { info, success, dim } from "../ux.js";

const DEFAULT_CALLBACK_PORT = 43110;
const DEFAULT_LOGIN_BASE_URL = "https://api.mcp-assistant.in";

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
 * Pair this machine with a remote gateway by signing in on the MCP Assistant
 * worker (api.mcp-assistant.in — the same Supabase identity used by
 * mcp-assistant.in).
 *
 * The browser opens the worker's OAuth login route, which bounces to Supabase's
 * hosted Google OAuth (PKCE). After the user signs in the worker issues a
 * short-lived one-time code and redirects to a loopback URL with it. `link`
 * captures the code, exchanges it for the access token via the worker, and
 * stores the token as the device credential. The token itself never appears in
 * a URL.
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

  // Loopback HTTP server that captures the one-time code from the redirect.
  const server = createServer((req, res) => {
    const reqUrl = new URL(req.url ?? "/", `http://${req.headers.host ?? "127.0.0.1"}`);
    if (reqUrl.pathname !== "/callback") {
      res.writeHead(404).end("Not found");
      return;
    }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(
      `<!doctype html><html lang='en'><head><meta charset='utf-8'/><meta name='viewport' content='width=device-width, initial-scale=1'/><title>MCP Assistant Login Successful</title><style>*{box-sizing:border-box}html,body{width:100%;height:100%;margin:0}body{display:flex;align-items:center;justify-content:center;background:#fff;color:#111;font-family:Segoe UI,Arial,sans-serif;text-align:center}.logo{width:56px;height:auto;margin:0 auto 10px;display:block}h2{margin:0 0 6px;font-size:1.35rem;font-weight:600}p{margin:0;color:#111;font-size:.98rem}.link{display:block;margin-top:8px;color:#111;text-decoration:underline}</style></head><body><main><img class='logo' src='https://mcp-assistant.in/logo.svg' alt='MCP Assistant'/><h2>Login successful!</h2><p>You can close the tab.</p><a class='link' href='https://mcp-assistant.in' target='_blank' rel='noreferrer noopener'>mcp-assistant.in</a></main></body></html>`,
    );
    server.close();
    const code = reqUrl.searchParams.get("code") ?? "";
    const st = reqUrl.searchParams.get("state") ?? "";
    resolve({ code, state: st });
  });
  server.listen(port, "127.0.0.1");

  let resolve!: (v: { code: string; state: string }) => void;
  const gotCallback = new Promise<{ code: string; state: string }>((r) => (resolve = r));
  const closeServer = () => {
    server.close();
  };

  const bounce = new URL("/oauth/login", loginBase.replace(/\/$/, ""));
  bounce.searchParams.set("next", `${redirectUri}?state=${stateParam}`);

  info("Opening browser for sign-in…");
  dim(`If the browser does not open, visit:\n  ${bounce}\n`);
  openBrowser(bounce.toString());

  const result = await Promise.race([
    gotCallback,
    once(server, "error").then(() => Promise.reject(new Error("callback server error"))),
  ]);

  if (result.state !== stateParam) {
    closeServer();
    throw new Error("State mismatch in authorization callback");
  }
  if (!result.code) {
    closeServer();
    throw new Error("No authorization code returned from sign-in");
  }

  // Exchange the one-time code for the device credential.
  let token: string;
  let tokenExpiresAt: number;
  try {
    const exchange = await fetch(
      `${loginBase.replace(/\/$/, "")}/oauth/codes/exchange`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: result.code }),
      },
    );
    const body = (await exchange.json().catch(() => ({}))) as {
      token?: string;
      expiresAt?: number;
      error?: string;
    };
    if (!exchange.ok || !body.token) {
      throw new Error(body.error ?? `exchange failed (${exchange.status})`);
    }
    token = body.token;
    tokenExpiresAt = body.expiresAt ?? Date.now() + 3600 * 1000;
  } catch (err) {
    closeServer();
    throw new Error(`Code exchange failed: ${(err as Error).message}`);
  }

  saveState({ ...state, remote, deviceId, token, tokenExpiresAt }, cwd);
  closeServer();
  success(`Linked device ${deviceId} with ${remote}`);
  dim(`State saved to: ${stateFilePath(cwd)}`);
  return { token, tokenExpiresAt };
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
