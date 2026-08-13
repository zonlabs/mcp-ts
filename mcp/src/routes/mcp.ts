import { Hono, type Context } from "hono";
import { randomUUID } from "node:crypto";
import { createMcpHandler } from "agents/mcp/server";
import type { McpServer } from "@modelcontextprotocol/server";
import { runWithRequestContext } from "../core/request-context";
import { authMiddleware } from "../middleware/auth";

type McpRouteBindings = Record<string, unknown>;

type McpRouteVariables = {
  userId: string;
  scopes: string[];
};

type McpRouteEnv = {
  Bindings: McpRouteBindings;
  Variables: McpRouteVariables;
};

type WorkerExecutionContext = {
  waitUntil(promise: Promise<unknown>): void;
};

export function createMcpRoutes(
  createServer: (options?: { scopes?: string[] }) => McpServer | Promise<McpServer>
): Hono<McpRouteEnv> {
  const app = new Hono<McpRouteEnv>();

  app.use(authMiddleware);

  app.all("/", async (c: Context<McpRouteEnv>) => {
    const requestId = randomUUID();
    const userId = c.get("userId");
    const scopes = c.get("scopes") ?? [];
    const mcpSessionId = c.req.header("mcp-session-id") ?? undefined;
    const handler = createMcpHandler(() => createServer({ scopes }), {
      route: "/mcp",
      corsOptions: false,
      authContext: {
        props: {
          userId,
          scopes,
          requestId,
        },
      },
    });

    const executionCtx = c.executionCtx as WorkerExecutionContext;

    return runWithRequestContext(
      {
        userId,
        requestId,
        scopes,
        mcpSessionId,
        env: c.env,
        executionCtx,
      },
      () => handler(c.req.raw, c.env, executionCtx as never)
    );
  });

  return app;
}
