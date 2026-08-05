/**
 * Tests for FileStorageBackend
 */
import { test, expect } from '@playwright/test';
import { FileStorageBackend } from '../../src/server/storage/file-backend';
import { createMockSession, createMockTokens } from '../test-utils';
import * as fs from 'fs/promises';
import * as path from 'path';

test.describe('FileStorageBackend', () => {
    let storage: FileStorageBackend;
    const testFilePath = path.join(__dirname, `test-sessions-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);

    test.beforeEach(async () => {
        storage = new FileStorageBackend({ path: testFilePath });
        await storage.init();
    });

    test.afterEach(async () => {
        try {
            await fs.unlink(testFilePath);
        } catch (e) {
            // Ignore if file doesn't exist
        }
    });

    test.describe('create', () => {
        test('should store session data in file', async () => {
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
});
