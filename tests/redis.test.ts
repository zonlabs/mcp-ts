/**
 * Tests for Redis module
 * Tests the dependency injection and initialization functionality
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Redis from 'ioredis-mock';

// Reset the module state before importing
beforeEach(() => {
    vi.resetModules();
});

describe('Redis Module', () => {
    describe('initRedis', () => {
        it('should initialize Redis with custom config', async () => {
            const { initRedis, closeRedis } = await import('../src/server/redis');

            // Set env var for test
            process.env.REDIS_URL = 'redis://localhost:6379';

            const redis = initRedis({
                verbose: false,
            });

            expect(redis).toBeDefined();
            expect(typeof redis.get).toBe('function');
            expect(typeof redis.set).toBe('function');

            await closeRedis();
        });

        it('should throw error when no URL provided', async () => {
            const { initRedis, closeRedis } = await import('../src/server/redis');

            const originalUrl = process.env.REDIS_URL;
            delete process.env.REDIS_URL;

            expect(() => initRedis({})).toThrow('Redis URL is required');

            process.env.REDIS_URL = originalUrl;
            await closeRedis();
        });

        it('should return existing instance on subsequent calls', async () => {
            const { initRedis, closeRedis } = await import('../src/server/redis');

            process.env.REDIS_URL = 'redis://localhost:6379';

            const redis1 = initRedis({ verbose: false });
            const redis2 = initRedis({ verbose: false });

            expect(redis1).toBe(redis2);

            await closeRedis();
        });
    });

    describe('setRedisInstance', () => {
        it('should allow injecting a mock Redis instance', async () => {
            const { setRedisInstance, getRedis, closeRedis } = await import('../src/server/redis');

            const mockRedis = new Redis();
            setRedisInstance(mockRedis as any);

            const instance = getRedis();
            expect(instance).toBe(mockRedis);

            await closeRedis();
        });
    });

    describe('getRedis', () => {
        it('should auto-initialize when called without prior init', async () => {
            const { getRedis, closeRedis } = await import('../src/server/redis');

            process.env.REDIS_URL = 'redis://localhost:6379';

            const redis = getRedis();
            expect(redis).toBeDefined();

            await closeRedis();
        });
    });
});
