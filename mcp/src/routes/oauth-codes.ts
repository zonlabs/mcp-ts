import { Hono } from "hono";
import {
  OAuthCodeStore,
  OAuthCodeStoreEnv,
  type OAuthCliSession,
} from "../durable-objects/oauth-code-store";
import { resolveCredentialAndScopes } from "../core/auth";
import type { BridgeSession, BridgeSessionEnv } from "../durable-objects/bridge-session";

const app = new Hono();

function codeStore(c: { env: unknown }): DurableObjectNamespace<OAuthCodeStore> {
  return (c.env as unknown as OAuthCodeStoreEnv).OAUTH_CODES;
}

function codeStub(c: { env: unknown }) {
  const store = codeStore(c);
  return store.get(store.idFromName("global"));
}

function base64url(value: string | Uint8Array): string {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function generateVerifier(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(32)));
}

async function generateChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  return base64url(new Uint8Array(digest));
}

/** Only loopback URLs (the CLI's local callback) may receive a code. */
function isAllowedRedirect(next: string): boolean {
  let url: URL;
  try {
    url = new URL(next);
  } catch {
    return false;
  }
  const loopback = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
  return loopback.has(url.hostname);
}

function renderLoginError(message: string): Response {
  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>MCP Assistant — Sign-in failed</title>
<style>
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f8fafc;font-family:system-ui,-apple-system,"Segoe UI",sans-serif}
.card{background:#fff;border:1px solid #e2e8f0;border-radius:16px;box-shadow:0 10px 30px rgba(15,23,42,.08);padding:48px 40px;text-align:center;max-width:420px}
.icon{width:48px;height:48px;border-radius:50%;background:#fee2e2;color:#dc2626;font-size:24px;line-height:48px;margin:0 auto 20px}
h1{font-size:20px;color:#0f172a;margin:0 0 8px;font-weight:600}
p{color:#475569;font-size:15px;line-height:1.5;margin:0 0 24px;word-break:break-word}
.brand{color:#94a3b8;font-size:13px}
</style></head>
<body>
<div class="card">
<div class="icon">✕</div>
<h1>Sign-in failed</h1>
<p>${message}</p>
<div class="brand">MCP Assistant</div>
</div>
</body>
</html>`;
  return new Response(html, {
    status: 400,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

/**
 * Decode a JWT's `exp` (seconds) without verifying it. Supabase access tokens
 * are JWTs whose real lifetime is ~1h — far longer than the 60s one-time code
 * TTL — so the CLI must learn the token's own expiry, not the code's.
 */
function jwtExpiresAt(token: string): number | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
    const payload = JSON.parse(new TextDecoder().decode(bytes)) as { exp?: unknown };
    return typeof payload.exp === "number" && Number.isFinite(payload.exp)
      ? payload.exp * 1000
      : null;
  } catch {
    return null;
  }
}

type SupabaseAuthPayload = {
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

export function normalizeAuthSession(body: SupabaseAuthPayload): OAuthCliSession {
  if (!body.access_token || !body.refresh_token) {
    throw new Error("Supabase did not return a complete authentication session");
  }
  const accessTokenExpiresAt =
    (typeof body.expires_at === "number" ? body.expires_at * 1000 : null) ??
    (typeof body.expires_in === "number" ? Date.now() + body.expires_in * 1000 : null) ??
    jwtExpiresAt(body.access_token);
  if (!accessTokenExpiresAt) {
    throw new Error("Supabase did not return an access token expiry");
  }
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    accessTokenExpiresAt,
  };
}

app.post("/codes/exchange", async (c) => {
  const body = await c.req.json().catch(() => null);
  const code = body?.code;
  if (typeof code !== "string" || !code) {
    return c.json({ error: "Missing code" }, 400);
  }
  const record = await codeStub(c).consume(code);
  if (!record) {
    return c.json({ error: "Invalid or expired code" }, 404);
  }
  return c.json({
    accessToken: record.accessToken,
    refreshToken: record.refreshToken,
    accessTokenExpiresAt: record.accessTokenExpiresAt,
  });
});

app.post("/token/refresh", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (typeof body?.refreshToken !== "string" || !body.refreshToken) {
    return c.json({ error: "Missing refresh token" }, 400);
  }
  const supabaseUrl = (process.env.SUPABASE_URL ?? "").replace(/\/$/, "");
  const anonKey = process.env.SUPABASE_ANON_KEY ?? "";
  if (!supabaseUrl || !anonKey) return c.json({ error: "Sign-in is not configured" }, 503);

  const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { apikey: anonKey, "content-type": "application/json" },
    body: JSON.stringify({ refresh_token: body.refreshToken }),
  });
  const refreshed = (await response.json().catch(() => ({}))) as SupabaseAuthPayload;
  if (!response.ok) {
    return c.json({ error: refreshed.error_description ?? refreshed.error ?? "Refresh failed" }, 401);
  }
  try {
    return c.json(normalizeAuthSession(refreshed));
  } catch (error) {
    return c.json({ error: (error as Error).message }, 502);
  }
});

app.post("/logout", async (c) => {
  const authorization = c.req.header("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  if (!match) return c.json({ error: "Unauthorized" }, 401);
  const auth = await resolveCredentialAndScopes(match[1]);
  if (!auth) return c.json({ error: "Unauthorized" }, 401);

  const supabaseUrl = (process.env.SUPABASE_URL ?? "").replace(/\/$/, "");
  const anonKey = process.env.SUPABASE_ANON_KEY ?? "";
  if (supabaseUrl && anonKey) {
    await fetch(`${supabaseUrl}/auth/v1/logout?scope=local`, {
      method: "POST",
      headers: { apikey: anonKey, authorization: `Bearer ${match[1]}` },
    }).catch(() => undefined);
  }

  const namespace = (c.env as unknown as BridgeSessionEnv).BRIDGE_SESSION;
  if (namespace) {
    const stub = namespace.get(namespace.idFromName(auth.userId)) as DurableObjectStub<BridgeSession>;
    await stub.disconnect();
  }
  return c.body(null, 204);
});

/**
 * Start sign-in. Bounces the browser to Supabase's hosted Google OAuth with a
 * PKCE challenge; the verifier is held in the OAuthCodeStore DO until the
 * callback returns.
 */
app.get("/login", async (c) => {
  const base = new URL(c.req.url).origin;
  const next = c.req.query("next") ?? "";
  if (!next || !isAllowedRedirect(next)) {
    return renderLoginError("Invalid redirect target");
  }
  const supabaseUrl = (process.env.SUPABASE_URL ?? "").replace(/\/$/, "");
  if (!supabaseUrl) {
    return renderLoginError("Sign-in is not configured");
  }

  const verifier = generateVerifier();
  const challenge = await generateChallenge(verifier);
  const sessionId = await codeStub(c).createSignIn(verifier, next);

  const redirectTo = `${base}/oauth/callback?session_id=${sessionId}`;
  const authUrl = `${supabaseUrl}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(
    redirectTo,
  )}&code_challenge=${challenge}&code_challenge_method=S256`;
  return Response.redirect(authUrl, 302);
});

/**
 * Supabase redirects here after Google sign-in with the auth code. Exchange it
 * (PKCE) for the access token, mint a one-time code for it, and send the
 * browser back to `next` with that code. The raw token never hits a URL.
 */
app.get("/callback", async (c) => {
  const sessionId = c.req.query("session_id") ?? "";
  const code = c.req.query("code") ?? "";
  if (!sessionId || !code) {
    return renderLoginError("Missing session id or authorization code");
  }
  const signIn = await codeStub(c).takeSignIn(sessionId);
  if (!signIn) {
    return renderLoginError("Sign-in session expired, please try again");
  }

  const supabaseUrl = (process.env.SUPABASE_URL ?? "").replace(/\/$/, "");
  const anonKey = process.env.SUPABASE_ANON_KEY ?? "";
  if (!supabaseUrl || !anonKey) {
    return renderLoginError("Sign-in is not configured");
  }

  const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=pkce`, {
    method: "POST",
    headers: { apikey: anonKey, "content-type": "application/json" },
    body: JSON.stringify({ auth_code: code, code_verifier: signIn.verifier }),
  });
  const body = (await res.json().catch(() => ({}))) as SupabaseAuthPayload;
  if (!res.ok) {
    return renderLoginError(
      `Sign-in failed: ${body.error_description ?? body.error ?? res.status}`,
    );
  }

  let session: OAuthCliSession;
  try {
    session = normalizeAuthSession(body);
  } catch (error) {
    return renderLoginError((error as Error).message);
  }
  const oneTimeCode = await codeStub(c).issue(session);
  const target = new URL(signIn.next);
  target.searchParams.set("code", oneTimeCode);
  return Response.redirect(target.toString(), 302);
});

export { app as oauthCodeRoutes };
