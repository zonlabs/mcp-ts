import type { Context, Next } from "hono";
import { resolveUserAndScopesFromRequest } from "../core/auth";
import { getIssuer, loadEnv } from "../config/env";

/** Variables set on Hono context by authMiddleware. */
export type AuthVariables = {
  userId: string;
  scopes: string[];
};

export async function authMiddleware(c: Context, next: Next) {
  const authRes = await resolveUserAndScopesFromRequest({
    headers: c.req.header(),
  });

  if (!authRes) {
    const issuer = getIssuer();
    const env = loadEnv();

    const origin = env.MCP_RESOURCE_URL
      ? new URL(env.MCP_RESOURCE_URL).origin
      : new URL(c.req.url).origin;
    const resourceMetadataUrl = `${origin}/.well-known/oauth-protected-resource`;
    return c.json(
      {
        error: "unauthorized",
        error_description: `Missing or invalid bearer token. Complete OAuth at: ${issuer}/oauth/authorize`,
      },
      401,
      {
        "WWW-Authenticate": `Bearer realm="OAuth", scope="openid email profile", resource_metadata="${resourceMetadataUrl}"`,
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Expose-Headers": "WWW-Authenticate",
      }
    );
  }

  c.set("userId", authRes.userId);
  c.set("scopes", authRes.scopes);
  await next();
}
