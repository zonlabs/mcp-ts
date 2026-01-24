/**
 * Tests for SessionStore
 * Tests Redis-backed session management functionality
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Redis from 'ioredis-mock';
import { SessionStore } from '../src/server/session-store';
import { setRedisInstance } from '../src/server/redis';
import { createMockSession, createMockTokens, createMockClientInfo } from './test-utils';

describe('SessionStore', () => {
    let redis: Redis;
    let sessionStore: SessionStore;

    beforeEach(() => {
        redis = new Redis();
        setRedisInstance(redis as any);
        sessionStore = new SessionStore(redis as any);
    });

    afterEach(async () => {
        await redis.flushall();
        redis.disconnect();
    });

    describe('generateSessionId', () => {
        it('should generate unique session IDs', () => {
            const id1 = sessionStore.generateSessionId();
            const id2 = sessionStore.generateSessionId();

            expect(id1).toBeDefined();
            expect(id2).toBeDefined();
            expect(id1).not.toBe(id2);
            expect(id1.length).toBeGreaterThan(10);
        });
    });

    describe('setClient', () => {
        it('should store session data in Redis', async () => {
            const session = createMockSession();

            await sessionStore.setClient({
                identity: session.identity,
                sessionId: session.sessionId,
                serverId: session.serverId,
                serverName: session.serverName,
                serverUrl: session.serverUrl,
                callbackUrl: session.callbackUrl,
                transportType: session.transportType,
            });

            const storedData = await redis.get(`mcp:session:${session.identity}:${session.sessionId}`);
            expect(storedData).toBeDefined();

            const parsed = JSON.parse(storedData!);
            expect(parsed.serverId).toBe(session.serverId);
            expect(parsed.serverUrl).toBe(session.serverUrl);
        });

        it('should set TTL on session', async () => {
            const session = createMockSession();

            await sessionStore.setClient({
                identity: session.identity,
                sessionId: session.sessionId,
                serverUrl: session.serverUrl,
                callbackUrl: session.callbackUrl,
            });

            const ttl = await redis.ttl(`mcp:session:${session.identity}:${session.sessionId}`);
            expect(ttl).toBeGreaterThan(0);
            expect(ttl).toBeLessThanOrEqual(43200); // 12 hours
        });
    });

    describe('getSession', () => {
        it('should retrieve stored session', async () => {
            const session = createMockSession();

            await sessionStore.setClient({
                identity: session.identity,
                sessionId: session.sessionId,
                serverId: session.serverId,
                serverName: session.serverName,
                serverUrl: session.serverUrl,
                callbackUrl: session.callbackUrl,
            });

            const retrieved = await sessionStore.getSession(session.identity, session.sessionId);

            expect(retrieved).toBeDefined();
            expect(retrieved?.serverId).toBe(session.serverId);
            expect(retrieved?.serverUrl).toBe(session.serverUrl);
        });

        it('should return null for non-existent session', async () => {
            const result = await sessionStore.getSession('unknown-identity', 'unknown-session');
            expect(result).toBeNull();
        });
    });

    describe('session updates', () => {
        it('should preserve OAuth tokens when updating session', async () => {
            const session = createMockSession();

            // Initial creation
            await sessionStore.setClient({
                identity: session.identity,
                sessionId: session.sessionId,
                serverId: session.serverId,
                serverUrl: session.serverUrl,
                callbackUrl: session.callbackUrl,
            });

            // Simulate saving tokens via direct Redis update
            const key = `mcp:session:${session.identity}:${session.sessionId}`;
            const storedData = await redis.get(key);
            const parsed = JSON.parse(storedData!);
            parsed.tokens = createMockTokens();
            parsed.active = true;
            await redis.set(key, JSON.stringify(parsed));

            // Verify tokens are stored
            const retrieved = await sessionStore.getSession(session.identity, session.sessionId);
            expect(retrieved?.active).toBe(true);
            expect(retrieved?.tokens).toBeDefined();
            expect(retrieved?.tokens?.access_token).toBe('mock-access-token-12345');
        });
    });

    describe('removeSession', () => {
        it('should delete session from Redis', async () => {
            const session = createMockSession();

            await sessionStore.setClient({
                identity: session.identity,
                sessionId: session.sessionId,
                serverUrl: session.serverUrl,
                callbackUrl: session.callbackUrl,
            });

            await sessionStore.removeSession(session.identity, session.sessionId);

            const result = await sessionStore.getSession(session.identity, session.sessionId);
            expect(result).toBeNull();
        });
    });

    describe('getIdentitySessionsData', () => {
        it('should return all sessions for an identity', async () => {
            const identity = 'test-user';
            const session1 = createMockSession({ sessionId: 'session-1', identity });
            const session2 = createMockSession({ sessionId: 'session-2', identity, serverName: 'Server 2' });

            await sessionStore.setClient({
                identity,
                sessionId: session1.sessionId,
                serverId: session1.serverId,
                serverName: session1.serverName,
                serverUrl: session1.serverUrl,
                callbackUrl: session1.callbackUrl,
            });

            await sessionStore.setClient({
                identity,
                sessionId: session2.sessionId,
                serverId: session2.serverId,
                serverName: session2.serverName,
                serverUrl: session2.serverUrl,
                callbackUrl: session2.callbackUrl,
            });

            const sessions = await sessionStore.getIdentitySessionsData(identity);

            expect(sessions.length).toBe(2);
            expect(sessions.map(s => s.sessionId)).toContain('session-1');
            expect(sessions.map(s => s.sessionId)).toContain('session-2');
        });

        it('should return empty array for identity with no sessions', async () => {
            const sessions = await sessionStore.getIdentitySessionsData('unknown-identity');
            expect(sessions).toEqual([]);
        });
    });
});
