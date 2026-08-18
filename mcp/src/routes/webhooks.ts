/**
 * @file mcp/src/routes/webhooks.ts
 * @description Ingestion endpoints for database webhooks (e.g. Supabase Database Webhooks)
 * to synchronize MCP connection changes to Cloudflare Durable Objects in real time.
 */

import { Hono } from "hono";
import type { BridgeSessionEnv } from "../durable-objects/bridge-session";

/**
 * Expected schema for Supabase Database Webhook payloads triggered via pg_net.
 */
interface SupabaseWebhookPayload {
  type: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  schema: string;
  record?: {
    id?: string;
    user_id?: string;
    [key: string]: unknown;
  } | null;
  old_record?: {
    id?: string;
    user_id?: string;
    [key: string]: unknown;
  } | null;
}

export interface WebhookEnv extends BridgeSessionEnv {
  SUPABASE_WEBHOOK_SECRET?: string;
  INTERNAL_WEBHOOK_SECRET?: string;
}

export const webhookRoutes = new Hono<{ Bindings: WebhookEnv }>();

/**
 * POST /internal/webhooks/supabase
 *
 * Receives database event notifications when an MCP connection row is inserted,
 * updated, or deleted, and triggers a real-time catalog refresh on the user's
 * active Durable Object bridge session.
 */
webhookRoutes.post("/supabase", async (c) => {
  const secret = c.req.header("x-webhook-secret");
  const expectedSecret =
    c.env?.SUPABASE_WEBHOOK_SECRET ??
    c.env?.INTERNAL_WEBHOOK_SECRET ??
    process.env.SUPABASE_WEBHOOK_SECRET ??
    process.env.INTERNAL_WEBHOOK_SECRET;

  if (expectedSecret && secret !== expectedSecret) {
    return c.json({ error: "Unauthorized: Invalid webhook secret" }, 401);
  }

  const payload = await c.req.json<SupabaseWebhookPayload>().catch(() => null);
  if (!payload || typeof payload !== "object") {
    return c.json({ error: "Bad Request: Expected valid JSON webhook payload" }, 400);
  }

  // Extract user_id from new record (INSERT/UPDATE) or old record (DELETE)
  const userId = payload.record?.user_id ?? payload.old_record?.user_id;
  if (!userId || typeof userId !== "string") {
    return c.json({ ok: true, message: "Ignored: No user_id present in record" });
  }

  // Asynchronously trigger catalog refresh on the user's active BridgeSession DO
  try {
    const namespace = c.env?.BRIDGE_SESSION;
    if (namespace) {
      const stub = namespace.get(namespace.idFromName(userId));
      let hasExecutionCtx = false;
      try {
        if (c.executionCtx?.waitUntil) {
          c.executionCtx.waitUntil(stub.refreshRemoteCatalog());
          hasExecutionCtx = true;
        }
      } catch {
        hasExecutionCtx = false;
      }

      if (!hasExecutionCtx) {
        void Promise.resolve(stub.refreshRemoteCatalog()).catch((err) => {
          console.error(`[webhook] Error refreshing catalog for user ${userId}:`, err);
        });
      }
    }
  } catch (error) {
    console.error(`[webhook] Failed to dispatch DO refresh for user ${userId}:`, error);
  }

  return c.json({
    ok: true,
    eventType: payload.type,
    table: payload.table,
    userId,
  });
});
