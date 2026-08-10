
import { RedisStorageBackend } from './redis-backend';
import { MemoryStorageBackend } from './memory-backend';
import { FileStorageBackend } from './file-backend';
import { SqliteStorage } from './sqlite-backend.js';
import { SupabaseStorageBackend } from './supabase-backend.js';
import { NeonStorageBackend, type NeonStorageOptions } from './neon-backend.js';
import type { SessionStore, Session, SessionMutationEvent, SessionMutationListener } from './types.js';
import type { McpObservabilityEvent } from '../../shared/events.js';

// Re-export types
export * from './types.js';
export { generateSessionId, generateServerId } from '../../shared/utils.js';
export { RedisStorageBackend, MemoryStorageBackend, FileStorageBackend, SqliteStorage, SupabaseStorageBackend, NeonStorageBackend };

export function createSupabaseStorageBackend(client: any): SupabaseStorageBackend {
    return new SupabaseStorageBackend(client);
}

export function createNeonStorageBackend(sql: any, options?: NeonStorageOptions): NeonStorageBackend {
    return new NeonStorageBackend(sql, options);
}

function warnIfNeonConnectionStringIsInsecure(connectionString: string): void {
    try {
        const url = new URL(connectionString);
        const sslMode = url.searchParams.get('sslmode');
        const channelBinding = url.searchParams.get('channel_binding');

        if (!sslMode) {
            console.warn('[mcp-ts][Storage] Neon connection string does not include sslmode. Neon recommends sslmode=verify-full for the strongest certificate verification.');
        } else if (!['verify-full', 'require'].includes(sslMode)) {
            console.warn(`[mcp-ts][Storage] Neon connection string uses sslmode=${sslMode}. Use sslmode=verify-full or sslmode=require for secure connections.`);
        }

        if (!channelBinding) {
            console.warn('[mcp-ts][Storage] Neon connection string does not include channel_binding=require. Add it when supported by your runtime and connection path.');
        }
    } catch {
        console.warn('[mcp-ts][Storage] Neon connection string could not be parsed for SSL checks.');
    }
}

let storageInstance: SessionStore | null = null;
let storagePromise: Promise<SessionStore> | null = null;
const sessionMutationListeners = new Set<SessionMutationListener>();

function emitSessionMutation(event: SessionMutationEvent): void {
    for (const listener of sessionMutationListeners) {
        try {
            const result = listener(event);
            if (result && typeof (result as Promise<void>).catch === 'function') {
                void (result as Promise<void>).catch((error) => {
                    console.error('[mcp-ts][Storage] Session mutation listener failed:', error);
                });
            }
        } catch (error) {
            console.error('[mcp-ts][Storage] Session mutation listener failed:', error);
        }
    }
}

function createSessionMutationEvent(prop: PropertyKey, args: any[]): SessionMutationEvent | null {
    const timestamp = Date.now();

    if (prop === 'create') {
        const [session] = args as [Session];
        if (!session?.userId || !session?.sessionId) return null;
        return {
            type: 'create',
            userId: session.userId,
            sessionId: session.sessionId,
            session,
            timestamp,
        };
    }

    if (prop === 'update') {
        const [userId, sessionId, patch] = args as [string, string, Partial<Session>];
        if (!userId || !sessionId) return null;
        return {
            type: 'update',
            userId,
            sessionId,
            patch,
            timestamp,
        };
    }

    if (prop === 'delete') {
        const [userId, sessionId] = args as [string, string];
        if (!userId || !sessionId) return null;
        return {
            type: 'delete',
            userId,
            sessionId,
            timestamp,
        };
    }

    return null;
}

async function initializeStorage<T extends SessionStore>(store: T): Promise<T> {
    if (typeof store.init === 'function') {
        await store.init();
    }
    return store;
}

async function createStorage(): Promise<SessionStore> {
    const type = process.env.MCP_TS_STORAGE_TYPE?.toLowerCase();

    // Explicit selection
    if (type === 'redis') {
        if (!process.env.REDIS_URL) {
            console.warn('[Storage] MCP_TS_STORAGE_TYPE is "redis" but REDIS_URL is missing');
        }
        try {
            const { getRedis } = await import('./redis.js');
            const redis = await getRedis();
            console.log('[mcp-ts][Storage] Explicit selection: "redis"');
            return await initializeStorage(new RedisStorageBackend(redis));
        } catch (error: any) {
            console.error('[mcp-ts][Storage] Failed to initialize Redis:', error.message);
            console.log('[mcp-ts][Storage] Falling back to In-Memory storage');
            return await initializeStorage(new MemoryStorageBackend());
        }
    }

    if (type === 'file') {
        const filePath = process.env.MCP_TS_STORAGE_FILE;
        console.log(`[mcp-ts][Storage] Explicit selection: "file" (${filePath || 'default'})`);
        return await initializeStorage(new FileStorageBackend({ path: filePath }));
    }

    if (type === 'sqlite') {
        const dbPath = process.env.MCP_TS_STORAGE_SQLITE_PATH;
        console.log(`[mcp-ts][Storage] Explicit selection: "sqlite" (${dbPath || 'default'})`);
        return await initializeStorage(new SqliteStorage({ path: dbPath }));
    }

    if (type === 'supabase') {
        const url = process.env.SUPABASE_URL;
        const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_ANON_KEY;
        
        if (!url || !key) {
            console.warn('[mcp-ts][Storage] Explicit selection "supabase" requires SUPABASE_URL and SUPABASE_SECRET_KEY.');
        } else {
            if (!process.env.SUPABASE_SECRET_KEY) {
                console.warn('[mcp-ts][Storage] ⚠️  Warning: Using "SUPABASE_ANON_KEY" for server-side storage. You may encounter RLS policy violations. "SUPABASE_SECRET_KEY" is recommended.');
            }
            try {
                const { createClient } = await import('@supabase/supabase-js');
                const client = createClient(url, key);
                console.log('[mcp-ts][Storage] Explicit selection: "supabase"');
                return await initializeStorage(new SupabaseStorageBackend(client as any));
            } catch (error: any) {
                console.error('[mcp-ts][Storage] Failed to initialize Supabase:', error.message);
                console.log('[mcp-ts][Storage] Falling back to In-Memory storage');
                return await initializeStorage(new MemoryStorageBackend());
            }
        }
    }

    if (type === 'neon') {
        const connectionString = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;

        if (!connectionString) {
            console.warn('[mcp-ts][Storage] Explicit selection "neon" requires NEON_DATABASE_URL or DATABASE_URL.');
        } else {
            try {
                const { neon } = await import('@neondatabase/serverless');
                warnIfNeonConnectionStringIsInsecure(connectionString);
                const sql = neon(connectionString);
                console.log('[mcp-ts][Storage] Explicit selection: "neon"');
                return await initializeStorage(new NeonStorageBackend(sql));
            } catch (error: any) {
                console.error('[mcp-ts][Storage] Failed to initialize Neon:', error.message);
                console.log('[mcp-ts][Storage] Falling back to In-Memory storage');
                return await initializeStorage(new MemoryStorageBackend());
            }
        }
    }

    if (type === 'memory') {
        console.log('[mcp-ts][Storage] Explicit selection: "memory"');
        return await initializeStorage(new MemoryStorageBackend());
    }

    // Automatic inference (Fallback)
    if (process.env.REDIS_URL) {
        try {
            const { getRedis } = await import('./redis.js');
            const redis = await getRedis();
            console.log('[mcp-ts][Storage] Auto-detection: "redis" (via REDIS_URL)');
            return await initializeStorage(new RedisStorageBackend(redis));
        } catch (error: any) {
            console.error('[mcp-ts][Storage] Redis auto-detection failed:', error.message);
            console.log('[mcp-ts][Storage] Falling back to next available backend');
        }
    }

    if (process.env.MCP_TS_STORAGE_FILE) {
        console.log(`[mcp-ts][Storage] Auto-detection: "file" (${process.env.MCP_TS_STORAGE_FILE})`);
        return await initializeStorage(new FileStorageBackend({ path: process.env.MCP_TS_STORAGE_FILE }));
    }

    if (process.env.MCP_TS_STORAGE_SQLITE_PATH) {
        console.log(`[mcp-ts][Storage] Auto-detection: "sqlite" (${process.env.MCP_TS_STORAGE_SQLITE_PATH})`);
        return await initializeStorage(new SqliteStorage({ path: process.env.MCP_TS_STORAGE_SQLITE_PATH }));
    }

    if (process.env.SUPABASE_URL && (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_ANON_KEY)) {
        try {
            const { createClient } = await import('@supabase/supabase-js');
            const url = process.env.SUPABASE_URL;
            const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_ANON_KEY!;
            
            if (!process.env.SUPABASE_SECRET_KEY) {
                console.warn('[mcp-ts][Storage] ⚠️ Warning: Using "SUPABASE_ANON_KEY" for server-side storage. You may encounter RLS policy violations. "SUPABASE_SECRET_KEY" is recommended.');
            }

            const client = createClient(url, key);
            console.log('[mcp-ts][Storage] Auto-detection: "supabase" (via SUPABASE_URL)');
            return await initializeStorage(new SupabaseStorageBackend(client as any));
        } catch (error: any) {
            console.error('[mcp-ts][Storage] Supabase auto-detection failed:', error.message);
        }
    }

    if (process.env.NEON_DATABASE_URL) {
        try {
            const { neon } = await import('@neondatabase/serverless');
            warnIfNeonConnectionStringIsInsecure(process.env.NEON_DATABASE_URL);
            const sql = neon(process.env.NEON_DATABASE_URL);
            console.log('[mcp-ts][Storage] Auto-detection: "neon" (via NEON_DATABASE_URL)');
            return await initializeStorage(new NeonStorageBackend(sql));
        } catch (error: any) {
            console.error('[mcp-ts][Storage] Neon auto-detection failed:', error.message);
        }
    }

    console.log('[mcp-ts][Storage] Defaulting to: "memory"');
    return await initializeStorage(new MemoryStorageBackend());
}

async function getStorage(): Promise<SessionStore> {
    if (storageInstance) {
        return storageInstance;
    }

    if (!storagePromise) {
        storagePromise = createStorage().catch((error) => {
            storagePromise = null;
            throw error;
        });
    }

    storageInstance = await storagePromise;
    return storageInstance;
}

/**
 * Set the storage instance (for testing)
 * @internal
 * @param instance - SessionStore instance or null to reset
 */
export function _setStorageInstanceForTesting(instance: SessionStore | null): void {
    storageInstance = instance;
    if (!instance) {
        storagePromise = null;
    }
}

export function onSessionMutation(listener: SessionMutationListener): () => void {
    sessionMutationListeners.add(listener);
    return () => {
        sessionMutationListeners.delete(listener);
    };
}

export function _resetSessionMutationListenersForTesting(): void {
    sessionMutationListeners.clear();
}

/**
 * Wraps a SessionStore with a Proxy that emits an McpObservabilityEvent for every
 * method call — reads (`db:read`) and writes (`db:write`) — including duration
 * and any error. Useful for debugging connection flows end-to-end.
 *
 * Usage:
 * ```ts
 * import { sessions, withDbObservability } from '@mcp-ts/sdk/server/storage';
 * const db = withDbObservability(sessions, (event) => console.log('[DB]', event));
 * // Use `db` instead of `sessions` throughout the request
 * ```
 *
 * @param store - The underlying SessionStore instance to wrap.
 * @param emit  - Called synchronously after each store method completes
 *                (or rejects) with a typed observability event.
 * @returns A drop-in SessionStore replacement.
 */
export function withDbObservability(
    store: SessionStore,
    emit: (event: McpObservabilityEvent) => void,
): SessionStore {
    const readMethods = new Set<keyof SessionStore>([
        'get', 'getCredentials', 'list', 'listIds', 'listAllIds',
    ]);

    return new Proxy(store, {
        get(target, prop, receiver) {
            const original = Reflect.get(target, prop, receiver);
            if (typeof original !== 'function') return original;

            return (...args: any[]) => {
                const method = prop as string;
                const isRead = readMethods.has(prop as keyof SessionStore);
                const start = performance.now();

                const emitEvent = (error?: string) => {
                    emit({
                        type: isRead ? 'db:read' : 'db:write',
                        level: error ? 'error' : 'debug',
                        message: `${method}(${args.map(a =>
                            typeof a === 'string' ? a.slice(0, 24) : typeof a,
                        ).join(', ')})`,
                        sessionId: typeof args[1] === 'string' ? args[1] : undefined,
                        payload: {
                            method,
                            argTypes: args.map(a => typeof a),
                            durationMs: performance.now() - start,
                            ...(error ? { error } : {}),
                        },
                        timestamp: Date.now(),
                    });
                };

                try {
                    const result = original.apply(target, args);
                    if (result instanceof Promise) {
                        return result.then(r => { emitEvent(); return r; })
                            .catch(e => { emitEvent(String(e)); throw e; });
                    }
                    emitEvent();
                    return result;
                } catch (e) {
                    emitEvent(String(e));
                    throw e;
                }
            };
        },
    });
}

/**
 * Global session store instance
 * Uses lazy initialization with a Proxy to handle async setup transparently
 */
export const sessions: SessionStore = new Proxy({} as SessionStore, {
    get(_target, prop) {
        return async (...args: any[]) => {
            const instance = await getStorage();
            const value = (instance as any)[prop];
            if (typeof value === 'function') {
                const result = await value.apply(instance, args);
                const event = createSessionMutationEvent(prop, args);
                if (event) {
                    emitSessionMutation(event);
                }
                return result;
            }
            return value;
        };
    },
});
