import { Hono } from "hono";
import { cors } from "hono/cors";
import { BridgeSession } from "./durable-objects/bridge-session";
import { OAuthCodeStore } from "./durable-objects/oauth-code-store";
import { createMcpServer } from "./core/server";
import { healthRoutes } from "./routes/health";
import { wellKnownRoutes } from "./routes/well-known";
import { createMcpRoutes } from "./routes/mcp";
import { oauthCodeRoutes } from "./routes/oauth-codes";
import { handleBridgeConnect } from "./routes/connect";
import { webhookRoutes } from "./routes/webhooks";

export { BridgeSession };
export { OAuthCodeStore };

const app = new Hono();

app.use("*", async (c, next) => {
  if (c.env && typeof c.env === "object") {
    Object.assign(process.env, c.env);
  }
  await next();
});

app.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "MCP-Session-Id", "x-webhook-secret"],
    exposeHeaders: ["Content-Type", "MCP-Session-Id", "mcp-session-id"],
  })
);

app.route("/healthz", healthRoutes);
app.route("/.well-known", wellKnownRoutes);
app.route("/oauth", oauthCodeRoutes);
app.route("/internal/webhooks", webhookRoutes);

const mcpRoutes = createMcpRoutes(createMcpServer);
app.route("/mcp", mcpRoutes);

export default {
  fetch(request: Request, env: Record<string, unknown>, ctx: unknown) {
    if (env && typeof env === "object") {
      Object.assign(process.env, env);
    }
    // Bypass Hono for the WebSocket upgrade so global middlewares (cors,
    // env copy) cannot interfere with the 101 handshake.
    if (new URL(request.url).pathname === "/bridge/connect") {
      return handleBridgeConnect(request, env);
    }
    return app.fetch(request, env, ctx as never);
  },
};
