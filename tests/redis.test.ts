/**
 * Tests for Redis module
 * Tests the dependency injection and initialization functionality
 */
import { test, expect } from '@playwright/test';
import Redis from 'ioredis-mock';
import path from 'path';

const redisModulePath = path.resolve(__dirname, '../src/server/storage/redis.ts');

// Helper to reset module
const resetModule = () => {
    delete require.cache[require.resolve('../src/server/storage/redis')];
};

test.describe('Redis Module', () => {
    test.beforeEach(() => {
        resetModule();
    });

    test.describe('initRedis', () => {
        test('should initialize Redis with custom config', async () => {
            const { initRedis, closeRedis } = require('../src/server/storage/redis');

            // Set env var for test
            process.env.REDIS_URL = 'redis://localhost:6379';

            const redis = await initRedis({
                verbose: false,
                RedisConstructor: Redis,
            });

            expect(redis).toBeDefined();
            expect(typeof redis.get).toBe('function');
            expect(typeof redis.set).toBe('function');

            await closeRedis();
        });

        test('should throw error when no URL provided', async () => {
            const { initRedis, closeRedis } = require('../src/server/storage/redis');

            const originalUrl = process.env.REDIS_URL;
            delete process.env.REDIS_URL;

            await expect(initRedis({ RedisConstructor: Redis })).rejects.toThrow('Redis URL is required');

            process.env.REDIS_URL = originalUrl;
            await closeRedis();
        });

        test('should return existing instance on subsequent calls', async () => {
            const { initRedis, closeRedis } = require('../src/server/storage/redis');

            process.env.REDIS_URL = 'redis://localhost:6379';

            const redis1 = await initRedis({ verbose: false, RedisConstructor: Redis });
            const redis2 = await initRedis({ verbose: false, RedisConstructor: Redis });

            expect(redis1).toBe(redis2);

            await closeRedis();
        });
    });

    test.describe('setRedisInstance', () => {
        test('should allow injecting a mock Redis instance', async () => {
            const { setRedisInstance, getRedis, closeRedis } = require('../src/server/storage/redis');

            const mockRedis = new Redis();
            setRedisInstance(mockRedis);

            const instance = await getRedis();
            expect(instance).toBe(mockRedis);

            await closeRedis();
        });
    });

    test.describe('getRedis', () => {
        test('should auto-initialize when called without prior init', async () => {
            const { getRedis, closeRedis } = require('../src/server/storage/redis');

            process.env.REDIS_URL = 'redis://localhost:6379';

            const redis = await getRedis();
            expect(redis).toBeDefined();

            await closeRedis();
        });
    });
});
