
import { redis } from '../redis';
import { RedisStorageBackend } from './redis-backend';
import { MemoryStorageBackend } from './memory-backend';
import { FileStorageBackend } from './file-backend';
import type { StorageBackend } from './types';

// Re-export types
export * from './types';
export { RedisStorageBackend, MemoryStorageBackend, FileStorageBackend };

function createStorage(): StorageBackend {
    const type = process.env.MCP_TS_STORAGE_TYPE?.toLowerCase();

    // Explicit selection
    if (type === 'redis') {
        if (!process.env.REDIS_URL) {
            console.warn('[Storage] MCP_TS_STORAGE_TYPE is "redis" but REDIS_URL is missing');
        }
        console.log('[Storage] Using Redis storage (Explicit)');
        return new RedisStorageBackend(redis);
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
        console.log('[Storage] Auto-detected REDIS_URL. Using Redis storage.');
        return new RedisStorageBackend(redis);
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

/**
 * Global session store instance
 */
export const storage: StorageBackend = createStorage();
