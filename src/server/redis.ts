/**
 * Redis connection management with dependency injection support
 * Allows configuration and testing without environment variables
 */
import { Redis } from 'ioredis';

export interface RedisConfig {
    /**
     * Redis connection URL (defaults to REDIS_URL env var)
     */
    url?: string;

    /**
     * Enable lazy connection (default: true)
     */
    lazyConnect?: boolean;

    /**
     * Maximum retries per request (default: 1)
     */
    maxRetriesPerRequest?: number;

    /**
     * Enable verbose logging (default: false)
     */
    verbose?: boolean;
}

declare global {
    // eslint-disable-next-line no-var
    var __redis: Redis | undefined;
    var __redisConfig: RedisConfig | undefined;
}

let redisInstance: Redis | null = null;

/**
 * Initialize Redis with custom configuration
 * Call this before any Redis operations if you need custom config
 * @param config - Redis configuration options
 */
export function initRedis(config: RedisConfig): Redis {
    if (redisInstance) {
        // Already initialized, return existing instance
        return redisInstance;
    }

    const url = config.url ?? process.env.REDIS_URL;

    if (!url) {
        throw new Error(
            'Redis URL is required. Set REDIS_URL environment variable or pass url in config.'
        );
    }

    redisInstance = new Redis(url, {
        lazyConnect: config.lazyConnect ?? true,
        maxRetriesPerRequest: config.maxRetriesPerRequest ?? 1,
    });

    if (config.verbose !== false) {
        redisInstance.on('ready', () => {
            console.log('✅ Redis connected');
        });

        redisInstance.on('error', (err) => {
            console.error('❌ Redis error:', err.message);
        });

        redisInstance.on('reconnecting', () => {
            console.log('🔄 Redis reconnecting...');
        });
    }

    // Store globally for hot reloading scenarios
    global.__redis = redisInstance;
    global.__redisConfig = config;

    return redisInstance;
}

/**
 * Get the Redis instance
 * Automatically initializes with default config if not already initialized
 */
export function getRedis(): Redis {
    if (redisInstance) {
        return redisInstance;
    }

    // Check for existing global instance (hot reload scenario)
    if (global.__redis) {
        redisInstance = global.__redis;
        return redisInstance;
    }

    // Initialize with default config
    return initRedis({});
}

/**
 * Set a custom Redis instance (useful for testing with mocks)
 * @param instance - Redis instance or mock
 */
export function setRedisInstance(instance: Redis): void {
    redisInstance = instance;
    global.__redis = instance;
}

/**
 * Close Redis connection and clear instance
 */
export async function closeRedis(): Promise<void> {
    if (redisInstance) {
        await redisInstance.quit();
        redisInstance = null;
        global.__redis = undefined;
    }
}

/**
 * Default Redis export for backward compatibility
 * Will auto-initialize on first access
 */
export const redis = new Proxy({} as Redis, {
    get(_target, prop) {
        const instance = getRedis();
        const value = (instance as any)[prop];
        if (typeof value === 'function') {
            return value.bind(instance);
        }
        return value;
    },
});
