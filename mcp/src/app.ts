import { Hono } from "hono";
import { cors } from "hono/cors";
import { createMcpServer } from "./core/server";
import { healthRoutes } from "./routes/health";
import { wellKnownRoutes } from "./routes/well-known";
import { createMcpRoutes } from "./routes/mcp";

export function createApp(): Hono {
  const app = new Hono();

  app.use(
    "*",
    cors({
      origin: "*",
      allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization", "MCP-Session-Id"],
      exposeHeaders: ["Content-Type", "MCP-Session-Id", "mcp-session-id"],
    })
  );

  app.route("/healthz", healthRoutes);
  app.route("/.well-known", wellKnownRoutes);

  const mcpRoutes = createMcpRoutes(createMcpServer);
  app.route("/mcp", mcpRoutes);

  return app;
}
