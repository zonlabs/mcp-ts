import { Hono } from "hono";
import { OAuthCodeStore, OAuthCodeStoreEnv } from "../oauth-codes";

const app = new Hono();

const ISSUE_SECRET_HEADER = "x-oauth-code-secret";

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

/** Only loopback URLs and explicitly allowed gateway hosts may receive a code. */
function isAllowedRedirect(next: string): boolean {
  let url: URL;
  try {
    url = new URL(next);
  } catch {
    return false;
  }
  const loopback = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
  if (loopback.has(url.hostname)) return true;
  const allowed = (process.env.OAUTH_ALLOWED_REDIRECT_HOSTS ?? "linkos.in")
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean);
  return allowed.includes(url.hostname);
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
  return c.json({ token: record.token, expiresAt: record.expiresAt });
});

app.post("/codes", async (c) => {
  const issueSecret = (process.env.OAUTH_CODE_ISSUE_SECRET ?? "").trim();
  const provided = c.req.header(ISSUE_SECRET_HEADER) ?? "";
  if (!issueSecret || provided !== issueSecret) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const body = await c.req.json().catch(() => null);
  const token = body?.token;
  if (typeof token !== "string" || !token) {
    return c.json({ error: "Missing token" }, 400);
  }
  const code = await codeStub(c).issue(token);
  return c.json({ code });
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
  const body = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !body.access_token) {
    return renderLoginError(
      `Sign-in failed: ${body.error_description ?? body.error ?? res.status}`,
    );
  }

  const oneTimeCode = await codeStub(c).issue(body.access_token);
  const target = new URL(signIn.next);
  target.searchParams.set("code", oneTimeCode);
  return Response.redirect(target.toString(), 302);
});

export { app as oauthCodeRoutes };
