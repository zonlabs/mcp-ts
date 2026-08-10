import { serve } from "@hono/node-server";
import { createApp } from "../app";
import { loadEnv } from "../config/env";
import { startSessionInvalidation, stopSessionInvalidation } from "./mcp-session-invalidation";
import { logger } from "./logger";

export type AppRuntime = {
  app: any;
  server: any;
  shutdown: () => Promise<void>;
};

export function createAppRuntime(): AppRuntime {
  logger.info("app_startup_initiated");
  startSessionInvalidation();
  const app = createApp();
  const env = loadEnv();
  const port = env.PORT;

  const server = serve({
    fetch: app.fetch,
    port,
  });

  logger.info("app_startup_completed", { port });

  let shutdownPromise: Promise<void> | null = null;

  const shutdown = (): Promise<void> => {
    if (shutdownPromise) return shutdownPromise;

    logger.info("app_shutdown_initiated");

    shutdownPromise = (async () => {
      // 1. Close HTTP intake
      await new Promise<void>((resolve) => {
        server.close(() => {
          logger.info("http_intake_closed");
          resolve();
        });
      });

      // 2. Stop Supabase subscriptions
      await stopSessionInvalidation();
      logger.info("supabase_subscriptions_closed");

      logger.info("app_shutdown_completed");
    })();

    return shutdownPromise;
  };

  return {
    app,
    server,
    shutdown,
  };
}
