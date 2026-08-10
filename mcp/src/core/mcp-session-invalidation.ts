import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { invalidateMultiSessionClient, invalidateAllMultiSessionClients, removeCachedSession } from "./multi-session-client-registry";
import { supabase } from "../db/supabase";

type SessionChangeRow = {
  id?: unknown;
  user_id?: unknown;
  status?: unknown;
};

type SessionChangePayload = {
  eventType?: string;
  new?: SessionChangeRow | null;
  old?: SessionChangeRow | null;
};

type SessionInvalidationBridgeOptions = {
  supabase: Pick<SupabaseClient, "channel" | "removeChannel">;
  invalidateUser: (userId: string) => void;
  debounceMs?: number;
  logger?: Pick<Console, "info" | "warn" | "error">;
};

export type SessionInvalidationBridge = {
  start: () => void;
  stop: () => Promise<void>;
};

const DEFAULT_DEBOUNCE_MS = 250;
const CHANNEL_NAME = "workflow-mcp-sessions";

function normalizeUserId(raw: unknown): string | undefined {
  if (typeof raw !== "string") {
    return undefined;
  }
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

const MAX_MAP_SIZE = 10000;
const sessionIdToUserId = new Map<string, { userId: string; sessionId: string }>();

function normalizeSessionId(raw: unknown): string | undefined {
  if (typeof raw !== "string") {
    return undefined;
  }
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function createMcpSessionInvalidationBridge(
  options: SessionInvalidationBridgeOptions
): SessionInvalidationBridge {
  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  const logger = options.logger;
  const pending = new Map<string, NodeJS.Timeout>();
  let channel: RealtimeChannel | null = null;

  function scheduleInvalidation(userId: string): void {
    const existing = pending.get(userId);
    if (existing) {
      clearTimeout(existing);
    }

    const timer = setTimeout(() => {
      pending.delete(userId);
      options.invalidateUser(userId);
    }, debounceMs);

    pending.set(userId, timer);
  }

  function handlePayload(payload: SessionChangePayload): void {
    // Track UUID id -> userId mapping from INSERT/UPDATE events.
    // This lets us resolve DELETE events that only contain the primary key.
    const rowId = normalizeSessionId(payload.new?.id) ?? normalizeSessionId(payload.old?.id);
    const newUserId = normalizeUserId(payload.new?.user_id);
    const textSessionId = (payload.new as any)?.session_id ?? (payload.old as any)?.session_id;

    if (rowId && newUserId && textSessionId) {
      sessionIdToUserId.set(rowId, { userId: newUserId, sessionId: textSessionId });
      if (sessionIdToUserId.size > MAX_MAP_SIZE) {
        const oldestKey = sessionIdToUserId.keys().next().value;
        if (oldestKey !== undefined) {
          sessionIdToUserId.delete(oldestKey);
        }
      }
    }

    const eventType = payload.eventType;

    if (eventType === "UPDATE") {
      const oldStatus = payload.old?.status;
      const newStatus = payload.new?.status;
      const statusChanged =
        oldStatus !== undefined &&
        newStatus !== undefined &&
        oldStatus !== newStatus;

      if (!statusChanged) {
        // saveSession() heartbeats only bump updated_at/expires_at,
        // not the actual session configuration. Skip invalidation.
        return;
      }
      
      // If toggled to pending, disconnect it incrementally
      if (newStatus === "pending") {
        if (rowId) {
          const mapped = sessionIdToUserId.get(rowId);
          if (mapped) {
            sessionIdToUserId.delete(rowId);
            removeCachedSession(mapped.userId, mapped.sessionId).catch((err) => {
              logger?.error?.("[mcp-session-invalidation] Failed to remove cached session during deactivation", err);
            });
            return;
          }
        }
      }
    }

    // For DELETE events, try to resolve from map and do incremental disconnect
    if (eventType === "DELETE") {
      if (rowId) {
        const mapped = sessionIdToUserId.get(rowId);
        if (mapped) {
          sessionIdToUserId.delete(rowId);
          removeCachedSession(mapped.userId, mapped.sessionId).catch((err) => {
            logger?.error?.("[mcp-session-invalidation] Failed to remove cached session", err);
          });
          return;
        }
        logger?.warn?.("[mcp-session-invalidation] Realtime event (no userId, rowId=" + rowId + " not in map — invalidating all)");
        invalidateAllMultiSessionClients();
        return;
      }
    }

    // Fallback for INSERT, UPDATE, or local events that carry userId
    const userId = newUserId ?? normalizeUserId(payload.old?.user_id);

    if (userId) {
      scheduleInvalidation(userId);
      return;
    }

    // Fallback for DELETE-like events if eventType is missing but rowId exists
    if (rowId) {
      const mapped = sessionIdToUserId.get(rowId);
      if (mapped) {
        sessionIdToUserId.delete(rowId);
        scheduleInvalidation(mapped.userId);
        return;
      }

      logger?.warn?.("[mcp-session-invalidation] Realtime event (no userId, rowId=" + rowId + " not in map — invalidating all)");
      invalidateAllMultiSessionClients();
      return;
    }
  }

  let stopped = false;
  let retryDelay = 5000;

  function subscribeWithRetry(): void {
    const subChannel = options.supabase
      .channel(CHANNEL_NAME)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "mcp_sessions",
        },
        handlePayload
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          options.logger?.info?.("[mcp-session-invalidation] Realtime subscription active.");
          retryDelay = 5000;
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          options.logger?.error?.(
            `[mcp-session-invalidation] Realtime subscription status: ${status}. Retrying in ${retryDelay}ms.`
          );
          options.supabase.removeChannel(subChannel).catch(() => {});
          if (!stopped) {
            retryDelay = Math.min(retryDelay * 2, 30000);
            setTimeout(subscribeWithRetry, retryDelay);
          }
        }
      });
    channel = subChannel;
  }

  return {
    start() {
      if (channel) {
        return;
      }
      stopped = false;
      subscribeWithRetry();
    },
    async stop() {
      stopped = true;
      for (const timer of pending.values()) {
        clearTimeout(timer);
      }
      pending.clear();

      if (!channel) {
        return;
      }

      const active = channel;
      channel = null;
      await options.supabase.removeChannel(active);
    },
  };
}

let singletonBridge: SessionInvalidationBridge | null = null;

export function startSessionInvalidation(): void {
  if (singletonBridge) {
    return;
  }

  singletonBridge = createMcpSessionInvalidationBridge({
    supabase,
    invalidateUser: invalidateMultiSessionClient,
    logger: console,
  });
  singletonBridge.start();
}

export async function stopSessionInvalidationForTests(): Promise<void> {
  if (!singletonBridge) {
    return;
  }
  const active = singletonBridge;
  singletonBridge = null;
  await active.stop();
}

export const stopSessionInvalidation = stopSessionInvalidationForTests;
