/**
 * Tests for RedisStorageBackend
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Redis from 'ioredis-mock';
import { RedisStorageBackend } from '../../src/server/storage/redis-backend';
import { setRedisInstance } from '../../src/server/redis';
import { createMockSession, createMockTokens } from '../test-utils';

describe('RedisStorageBackend', () => {
    let redis: Redis;
    let storage: RedisStorageBackend;

    beforeEach(() => {
        redis = new Redis();
        setRedisInstance(redis as any);
        storage = new RedisStorageBackend(redis as any);
    });

    afterEach(async () => {
        await redis.flushall();
        redis.disconnect();
    });

    describe('generateSessionId', () => {
        it('should generate unique session IDs', () => {
            const id1 = storage.generateSessionId();
            const id2 = storage.generateSessionId();

            expect(id1).toBeDefined();
            expect(id2).toBeDefined();
            expect(id1).not.toBe(id2);
            expect(id1.length).toBeGreaterThan(10);
        });
    });

    describe('createSession', () => {
        it('should store session data in Redis', async () => {
            const session = createMockSession();

            await storage.createSession(session);

            const storedData = await redis.get(`mcp:session:${session.identity}:${session.sessionId}`);
            expect(storedData).toBeDefined();

            const parsed = JSON.parse(storedData!);
            expect(parsed.serverId).toBe(session.serverId);
            expect(parsed.serverUrl).toBe(session.serverUrl);
        });

        it('should set TTL on session', async () => {
            const session = createMockSession();

            await storage.createSession(session);

            const ttl = await redis.ttl(`mcp:session:${session.identity}:${session.sessionId}`);
            expect(ttl).toBeGreaterThan(0);
            expect(ttl).toBeLessThanOrEqual(43200); // 12 hours
        });

        it('should throw if session already exists', async () => {
            const session = createMockSession();
            await storage.createSession(session);

            await expect(storage.createSession(session)).rejects.toThrow('already exists');
        });
    });

    describe('updateSession', () => {
        // Note: This test is skipped because ioredis-mock doesn't support cjson in Lua scripts
        // The Lua script works correctly in production Redis
        it.skip('should update existing session atomically', async () => {
            const session = createMockSession();
            await storage.createSession(session);

            await storage.updateSession(session.identity, session.sessionId, {
                active: true,
                tokens: createMockTokens()
            });

            const retrieved = await storage.getSession(session.identity, session.sessionId);
            expect(retrieved?.active).toBe(true);
            expect(retrieved?.tokens).toBeDefined();
            expect(retrieved?.serverId).toBe(session.serverId); // Original data preserved
        });

        it('should throw if session does not exist', async () => {
            await expect(
                storage.updateSession('unknown', 'unknown', { active: true })
            ).rejects.toThrow('not found');
        });
    });

    describe('getSession', () => {
        it('should retrieve stored session', async () => {
            const session = createMockSession();

            await storage.createSession(session);

            const retrieved = await storage.getSession(session.identity, session.sessionId);

            expect(retrieved).toBeDefined();
            expect(retrieved?.serverId).toBe(session.serverId);
            expect(retrieved?.serverUrl).toBe(session.serverUrl);
        });

        it('should return null for non-existent session', async () => {
            const result = await storage.getSession('unknown-identity', 'unknown-session');
            expect(result).toBeNull();
        });
    });

    describe('removeSession', () => {
        it('should delete session from Redis', async () => {
            const session = createMockSession();

            await storage.createSession(session);

            await storage.removeSession(session.identity, session.sessionId);

            const result = await storage.getSession(session.identity, session.sessionId);
            expect(result).toBeNull();
        });
    });

    describe('getIdentitySessionsData', () => {
        it('should return all sessions for an identity', async () => {
            const identity = 'test-user';
            const session1 = createMockSession({ sessionId: 'session-1', identity });
            const session2 = createMockSession({ sessionId: 'session-2', identity, serverName: 'Server 2' });

            await storage.createSession(session1);
            await storage.createSession(session2);

            const sessions = await storage.getIdentitySessionsData(identity);

            expect(sessions.length).toBe(2);
            expect(sessions.map(s => s.sessionId)).toContain('session-1');
            expect(sessions.map(s => s.sessionId)).toContain('session-2');
        });

        it('should return empty array for identity with no sessions', async () => {
            const sessions = await storage.getIdentitySessionsData('unknown-identity');
            expect(sessions).toEqual([]);
        });
    });
});
