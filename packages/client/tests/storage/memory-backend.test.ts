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

    test.describe('create', () => {
        test('should store session data in memory', async () => {
            const session = createMockSession();
            await storage.create(session);

            const retrieved = await storage.get(session.userId, session.sessionId);
            expect(retrieved).toBeDefined();
            expect(retrieved?.serverId).toBe(session.serverId);
        });

        test('should throw if session already exists', async () => {
            const session = createMockSession();
            await storage.create(session);

            await expect(storage.create(session)).rejects.toThrow('already exists');
        });
    });

    test.describe('update', () => {
        test('should manage lifecycle with explicit session status', async () => {
            const session = createMockSession({ status: undefined });

            await storage.create(session);

            let retrieved = await storage.get(session.userId, session.sessionId);
            expect(retrieved?.status).toBe('pending');
            expect(retrieved?.expiresAt).toBeGreaterThan(Date.now());

            await storage.update(session.userId, session.sessionId, { status: 'active' });

            retrieved = await storage.get(session.userId, session.sessionId);
            expect(retrieved?.status).toBe('active');
            expect(retrieved?.expiresAt).toBeNull();

        });

        test('should update existing session', async () => {
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
            expect(retrieved?.serverId).toBe(session.serverId);
        });

        test('should round-trip session tool policy updates', async () => {
            const session = createMockSession();
            await storage.create(session);

            await storage.update(session.userId, session.sessionId, {
                toolPolicy: {
                    mode: 'allowlist',
                    toolIds: ['github::get_issue', 'github::list_pull_requests'],
                    updatedAt: 1780076400000,
                },
            });

            const retrieved = await storage.get(session.userId, session.sessionId);
            expect(retrieved?.toolPolicy).toEqual({
                mode: 'allowlist',
                toolIds: ['github::get_issue', 'github::list_pull_requests'],
                updatedAt: 1780076400000,
            });
        });
        test('should throw if session does not exist', async () => {
            await expect(
                storage.update('unknown', 'unknown', { status: 'active' })
            ).rejects.toThrow('not found');
        });
    });

    test.describe('list', () => {
        test('should return all sessions for a userId', async () => {
            const userId = 'test-user';
            const session1 = createMockSession({ sessionId: 'session-1', userId });
            const session2 = createMockSession({ sessionId: 'session-2', userId });

            await storage.create(session1);
            await storage.create(session2);

            const sessions = await storage.list(userId);
            expect(sessions.length).toBe(2);
        });
    });

    test.describe('delete', () => {
        test('should delete session from memory', async () => {
            const session = createMockSession();
            await storage.create(session);

            await storage.delete(session.userId, session.sessionId);

            const result = await storage.get(session.userId, session.sessionId);
            expect(result).toBeNull();
        });
    });
});
