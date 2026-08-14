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

export { app as oauthCodeRoutes };
