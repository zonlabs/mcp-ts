import { Hono } from "hono";
import { getIssuer, loadEnv } from "../config/env";

const app = new Hono();

app.get("/oauth-authorization-server", (c) => {
  const issuer = getIssuer();
  console.log("[well-known] GET /oauth-authorization-server issuer=%s", issuer);
  return c.json(
    {
      issuer,
      authorization_endpoint: `${issuer}/authorize`,
      token_endpoint: `${issuer}/token`,
      registration_endpoint: `${issuer}/register`,
      scopes_supported: ["openid", "email", "profile"],
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
      subject_types_supported: ["public"],
    },
    200,
    {
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    }
  );
});

app.get("/oauth-protected-resource", (c) => {
  const issuer = getIssuer();
  const env = loadEnv();
  const resourceUrl = env.MCP_RESOURCE_URL ?? `${new URL(c.req.url).origin}/mcp`;
  const resourceDocUrl = env.MCP_RESOURCE_DOC_URL ?? resourceUrl;

  return c.json({
    authorization_servers: [issuer],
    bearer_methods_supported: ["header"],
    resource: resourceUrl,
    resource_documentation: resourceDocUrl,
    scopes_supported: ["openid", "email", "profile"],
  });
});

export { app as wellKnownRoutes };
