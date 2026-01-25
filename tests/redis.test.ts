/**
 * Tests for Redis module
 * Tests the dependency injection and initialization functionality
 */
import { test, expect } from '@playwright/test';
import Redis from 'ioredis-mock';
import path from 'path';

const redisModulePath = path.resolve(__dirname, '../src/server/redis.ts');

// Helper to reset module
const resetModule = () => {
    delete require.cache[require.resolve('../src/server/redis')];
};

test.describe('Redis Module', () => {
    test.beforeEach(() => {
        resetModule();
    });

    test.describe('initRedis', () => {
        test('should initialize Redis with custom config', async () => {
            const { initRedis, closeRedis } = require('../src/server/redis');

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

        test('should throw error when no URL provided', async () => {
            const { initRedis, closeRedis } = require('../src/server/redis');

            const originalUrl = process.env.REDIS_URL;
            delete process.env.REDIS_URL;

            expect(() => initRedis({})).toThrow('Redis URL is required');

            process.env.REDIS_URL = originalUrl;
            await closeRedis();
        });

        test('should return existing instance on subsequent calls', async () => {
            const { initRedis, closeRedis } = require('../src/server/redis');

            process.env.REDIS_URL = 'redis://localhost:6379';

            const redis1 = initRedis({ verbose: false });
            const redis2 = initRedis({ verbose: false });

            expect(redis1).toBe(redis2);

            await closeRedis();
        });
    });

    test.describe('setRedisInstance', () => {
        test('should allow injecting a mock Redis instance', async () => {
            const { setRedisInstance, getRedis, closeRedis } = require('../src/server/redis');

            const mockRedis = new Redis();
            setRedisInstance(mockRedis);

            const instance = getRedis();
            expect(instance).toBe(mockRedis);

            await closeRedis();
        });
    });

    test.describe('getRedis', () => {
        test('should auto-initialize when called without prior init', async () => {
            const { getRedis, closeRedis } = require('../src/server/redis');

            process.env.REDIS_URL = 'redis://localhost:6379';

            const redis = getRedis();
            expect(redis).toBeDefined();

            await closeRedis();
        });
    });
});
