/**
 * Tests for RedisStorageBackend
 */
import { test, expect } from '@playwright/test';
import Redis from 'ioredis-mock';
import { RedisStorageBackend } from '../../src/server/storage/redis-backend';
import { setRedisInstance } from '../../src/server/storage/redis';
import { createMockSession, createMockTokens } from '../test-utils';
import {
    DORMANT_SESSION_EXPIRATION_SECONDS,
    PENDING_SESSION_EXPIRATION_SECONDS,
} from '../../src/shared/constants';

test.describe('RedisStorageBackend', () => {
    let redis: any;
    let storage: RedisStorageBackend;

    test.beforeEach(() => {
        redis = new Redis();
        setRedisInstance(redis as any);
        storage = new RedisStorageBackend(redis as any);
    });

    test.afterEach(async () => {
        await redis.flushall();
        redis.disconnect();
    });

    test.describe('generateSessionId', () => {
        test('should generate unique session IDs', () => {
            const id1 = storage.generateSessionId();
            const id2 = storage.generateSessionId();

            expect(id1).toBeDefined();
            expect(id2).toBeDefined();
            expect(id1).not.toBe(id2);
            expect(id1.length).toBeGreaterThan(10);
        });
    });

    test.describe('create', () => {
        test('should store session data in Redis', async () => {
            const session = createMockSession();

            await storage.create(session);

            const storedData = await redis.get(`mcp:session:${session.userId}:${session.sessionId}`);
            expect(storedData).toBeDefined();

            const parsed = JSON.parse(storedData!);
            expect(parsed.serverId).toBe(session.serverId);
            expect(parsed.serverUrl).toBe(session.serverUrl);
        });

        test('should set dormant TTL on active sessions', async () => {
            const session = createMockSession();

            await storage.create(session);

            const ttl = await redis.ttl(`mcp:session:${session.userId}:${session.sessionId}`);
            expect(ttl).toBeGreaterThan(0);
            expect(ttl).toBeLessThanOrEqual(DORMANT_SESSION_EXPIRATION_SECONDS);
        });

        test('should set short TTL on pending sessions', async () => {
            const session = createMockSession({ status: 'pending' });

            await storage.create(session);

            const ttl = await redis.ttl(`mcp:session:${session.userId}:${session.sessionId}`);
            expect(ttl).toBeGreaterThan(0);
            expect(ttl).toBeLessThanOrEqual(PENDING_SESSION_EXPIRATION_SECONDS);
        });

        test('should throw if session already exists', async () => {
            const session = createMockSession();
            await storage.create(session);

            await expect(storage.create(session)).rejects.toThrow('already exists');
        });
    });

    test.describe('update', () => {
        // Note: This test is skipped because ioredis-mock doesn't support cjson in Lua scripts
        // The Lua script works correctly in production Redis
        test.skip('should update existing session atomically', async () => {
            const session = createMockSession();
            await storage.create(session);

            const tokens = createMockTokens();
            await storage.update(session.userId, session.sessionId, { status: 'active' });
            await storage.patchCredentials(session.userId, session.sessionId, { tokens });

            const retrieved = await storage.get(session.userId, session.sessionId);
            const credentials = await storage.getCredentials(session.userId, session.sessionId);
            expect(retrieved?.status).toBe('active');
            expect((retrieved as any)?.tokens).toBeUndefined();
            expect(credentials?.tokens).toEqual(tokens);
            expect(retrieved?.serverId).toBe(session.serverId); // Original data preserved
        });

        test('should throw if session does not exist', async () => {
            await expect(
                storage.update('unknown', 'unknown', { status: 'active' })
            ).rejects.toThrow('not found');
        });
    });

    test.describe('get', () => {
        test('should retrieve stored session', async () => {
            const session = createMockSession();

            await storage.create(session);

            const retrieved = await storage.get(session.userId, session.sessionId);

            expect(retrieved).toBeDefined();
            expect(retrieved?.serverId).toBe(session.serverId);
            expect(retrieved?.serverUrl).toBe(session.serverUrl);
        });

        test('should return null for non-existent session', async () => {
            const result = await storage.get('unknown-user', 'unknown-session');
            expect(result).toBeNull();
        });
    });

    test.describe('delete', () => {
        test('should delete session from Redis', async () => {
            const session = createMockSession();

            await storage.create(session);

            await storage.delete(session.userId, session.sessionId);

            const result = await storage.get(session.userId, session.sessionId);
            expect(result).toBeNull();
        });
    });

    test.describe('list', () => {
        test('should return all sessions for a userId', async () => {
            const userId = 'test-user';
            const session1 = createMockSession({ sessionId: 'session-1', userId });
            const session2 = createMockSession({ sessionId: 'session-2', userId, serverName: 'Server 2' });

            await storage.create(session1);
            await storage.create(session2);

            const sessions = await storage.list(userId);

            expect(sessions.length).toBe(2);
            expect(sessions.map(s => s.sessionId)).toContain('session-1');
            expect(sessions.map(s => s.sessionId)).toContain('session-2');
        });

        test('should return empty array for userId with no sessions', async () => {
            const sessions = await storage.list('unknown-user');
            expect(sessions).toEqual([]);
        });

        test('should prune stale session ids from the userId index', async () => {
            const session = createMockSession({ sessionId: 'stale-session' });
            await storage.create(session);

            await redis.del(`mcp:session:${session.userId}:${session.sessionId}`);

            const sessions = await storage.list(session.userId);
            const indexedSessionIds = await redis.smembers(`mcp:userId:${session.userId}:sessions`);

            expect(sessions).toEqual([]);
            expect(indexedSessionIds).toEqual([]);
        });
    });

    test.describe('listAllIds', () => {
        test('should return plain session ids without userId prefixes', async () => {
            const session = createMockSession({ sessionId: 'session-admin-view' });
            await storage.create(session);

            const sessionIds = await storage.listAllIds();

            expect(sessionIds).toContain('session-admin-view');
            expect(sessionIds).not.toContain(`${session.userId}:${session.sessionId}`);
        });
    });

    test.describe('clearAll', () => {
        test('should delete both session keys and userId indexes', async () => {
            const session = createMockSession({ sessionId: 'clear-all-session' });
            await storage.create(session);

            await storage.clearAll();

            const sessionIds = await storage.listIds(session.userId);
            const indexedSessionIds = await redis.smembers(`mcp:userId:${session.userId}:sessions`);

            expect(sessionIds).toEqual([]);
            expect(indexedSessionIds).toEqual([]);
        });
    });

    test.describe('cleanupExpired', () => {
        test('should remove stale userId indexes for missing session keys', async () => {
            const session = createMockSession({ sessionId: 'expired-session' });
            await storage.create(session);

            await redis.del(`mcp:session:${session.userId}:${session.sessionId}`);

            await storage.cleanupExpired();

            const indexedSessionIds = await redis.smembers(`mcp:userId:${session.userId}:sessions`);
            expect(indexedSessionIds).toEqual([]);
        });
    });
});
