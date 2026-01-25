/**
 * Tests for MemoryStorageBackend
 */
import { test, expect } from '@playwright/test';
import { MemoryStorageBackend } from '../../src/server/storage/memory-backend';
import { createMockSession, createMockTokens } from '../test-utils';

test.describe('MemoryStorageBackend', () => {
    let storage: MemoryStorageBackend;

    test.beforeEach(() => {
        storage = new MemoryStorageBackend();
    });

    test.describe('createSession', () => {
        test('should store session data in memory', async () => {
            const session = createMockSession();
            await storage.createSession(session);

            const retrieved = await storage.getSession(session.identity, session.sessionId);
            expect(retrieved).toBeDefined();
            expect(retrieved?.serverId).toBe(session.serverId);
        });

        test('should throw if session already exists', async () => {
            const session = createMockSession();
            await storage.createSession(session);

            await expect(storage.createSession(session)).rejects.toThrow('already exists');
        });
    });

    test.describe('updateSession', () => {
        test('should update existing session', async () => {
            const session = createMockSession();
            await storage.createSession(session);

            await storage.updateSession(session.identity, session.sessionId, {
                active: true,
                tokens: createMockTokens()
            });

            const retrieved = await storage.getSession(session.identity, session.sessionId);
            expect(retrieved?.active).toBe(true);
            expect(retrieved?.tokens).toBeDefined();
            expect(retrieved?.serverId).toBe(session.serverId);
        });

        test('should throw if session does not exist', async () => {
            await expect(
                storage.updateSession('unknown', 'unknown', { active: true })
            ).rejects.toThrow('not found');
        });
    });

    test.describe('getIdentitySessionsData', () => {
        test('should return all sessions for an identity', async () => {
            const identity = 'test-user';
            const session1 = createMockSession({ sessionId: 'session-1', identity });
            const session2 = createMockSession({ sessionId: 'session-2', identity });

            await storage.createSession(session1);
            await storage.createSession(session2);

            const sessions = await storage.getIdentitySessionsData(identity);
            expect(sessions.length).toBe(2);
        });
    });

    test.describe('removeSession', () => {
        test('should delete session from memory', async () => {
            const session = createMockSession();
            await storage.createSession(session);

            await storage.removeSession(session.identity, session.sessionId);

            const result = await storage.getSession(session.identity, session.sessionId);
            expect(result).toBeNull();
        });
    });
});
