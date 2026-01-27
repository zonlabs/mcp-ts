
import { RedisStorageBackend } from './redis-backend';
import { MemoryStorageBackend } from './memory-backend';
import { FileStorageBackend } from './file-backend';
import type { StorageBackend } from './types';

// Re-export types
export * from './types';
export { RedisStorageBackend, MemoryStorageBackend, FileStorageBackend };

let storageInstance: StorageBackend | null = null;
let storagePromise: Promise<StorageBackend> | null = null;

async function createStorage(): Promise<StorageBackend> {
    const type = process.env.MCP_TS_STORAGE_TYPE?.toLowerCase();

    // Explicit selection
    if (type === 'redis') {
        if (!process.env.REDIS_URL) {
            console.warn('[Storage] MCP_TS_STORAGE_TYPE is "redis" but REDIS_URL is missing');
        }
        try {
            const { getRedis } = await import('./redis.js');
            const redis = await getRedis();
            console.log('[Storage] Using Redis storage (Explicit)');
            return new RedisStorageBackend(redis);
        } catch (error: any) {
            console.error('[Storage] Failed to initialize Redis:', error.message);
            console.log('[Storage] Falling back to In-Memory storage');
            return new MemoryStorageBackend();
        }
    }

    if (type === 'file') {
        const filePath = process.env.MCP_TS_STORAGE_FILE;
        if (!filePath) {
            console.warn('[Storage] MCP_TS_STORAGE_TYPE is "file" but MCP_TS_STORAGE_FILE is missing');
        }
        console.log(`[Storage] Using File storage (${filePath}) (Explicit)`);
        const store = new FileStorageBackend({ path: filePath });
        store.init().catch(err => console.error('[Storage] Failed to initialize file storage:', err));
        return store;
    }

    if (type === 'memory') {
        console.log('[Storage] Using In-Memory storage (Explicit)');
        return new MemoryStorageBackend();
    }

    // Automatic inference (Fallback)
    if (process.env.REDIS_URL) {
        try {
            const { getRedis } = await import('./redis.js');
            const redis = await getRedis();
            console.log('[Storage] Auto-detected REDIS_URL. Using Redis storage.');
            return new RedisStorageBackend(redis);
        } catch (error: any) {
            console.error('[Storage] Redis auto-detection failed:', error.message);
            console.log('[Storage] Falling back to In-Memory storage');
            return new MemoryStorageBackend();
        }
    }

    if (process.env.MCP_TS_STORAGE_FILE) {
        console.log(`[Storage] Auto-detected MCP_TS_STORAGE_FILE. Using File storage (${process.env.MCP_TS_STORAGE_FILE}).`);
        const store = new FileStorageBackend({ path: process.env.MCP_TS_STORAGE_FILE });
        store.init().catch(err => console.error('[Storage] Failed to initialize file storage:', err));
        return store;
    }

    console.log('[Storage] No storage configured. Using In-Memory storage (Default).');
    return new MemoryStorageBackend();
}

async function getStorage(): Promise<StorageBackend> {
    if (storageInstance) {
        return storageInstance;
    }

    if (!storagePromise) {
        storagePromise = createStorage();
    }

    storageInstance = await storagePromise;
    return storageInstance;
}

/**
 * Global session store instance
 * Uses lazy initialization with a Proxy to handle async setup transparently
 */
export const storage: StorageBackend = new Proxy({} as StorageBackend, {
    get(_target, prop) {
        return async (...args: any[]) => {
            const instance = await getStorage();
            const value = (instance as any)[prop];
            if (typeof value === 'function') {
                return value.apply(instance, args);
            }
            return value;
        };
    },
});
