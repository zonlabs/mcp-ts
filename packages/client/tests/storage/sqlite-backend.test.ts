/**
 * Tests for SqliteStorage
 */
import { test, expect } from '@playwright/test';
import { SqliteStorage } from '../../src/server/storage/sqlite-backend';
import { createMockSession, createMockTokens } from '../test-utils';
import { DORMANT_SESSION_EXPIRATION_MS, STATE_EXPIRATION_MS } from '../../src/shared/constants';
import * as fs from 'fs';
import * as path from 'path';

test.describe('SqliteStorage', () => {
    let storage: SqliteStorage;
    const testDbPath = path.join(__dirname, `test-sessions-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);

    test.beforeEach(async () => {
        storage = new SqliteStorage({ path: testDbPath });
        await storage.init();
    });

    test.afterEach(async () => {
        await storage.disconnect();
        try {
            if (fs.existsSync(testDbPath)) {
                fs.unlinkSync(testDbPath);
            }
            if (fs.existsSync(testDbPath + '-journal')) { // better-sqlite3 wal/journal files
                fs.unlinkSync(testDbPath + '-journal');
            }
            if (fs.existsSync(testDbPath + '-shm')) {
                fs.unlinkSync(testDbPath + '-shm');
            }
            if (fs.existsSync(testDbPath + '-wal')) {
                fs.unlinkSync(testDbPath + '-wal');
            }
        } catch (e) {
            console.error('Failed to cleanup test db:', e);
        }
    });

    test.describe('create', () => {
        test('should store session data in sqlite', async () => {
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

    test.describe('cleanupExpired', () => {
        test('should remove expired sessions', async () => {
            const session = createMockSession({
                status: 'pending',
                createdAt: Date.now() - STATE_EXPIRATION_MS - 1000,
            });
            await storage.create(session);
            await storage.cleanupExpired();

            const retrieved = await storage.get(session.userId, session.sessionId);
            expect(retrieved).toBeNull();
        });

        test('should keep active sessions', async () => {
            const session = createMockSession();
            await storage.create(session);

            await storage.cleanupExpired();

            const retrieved = await storage.get(session.userId, session.sessionId);
            expect(retrieved).toBeDefined();
        });

        test('should remove dormant active sessions', async () => {
            const session = createMockSession({
                status: 'active',
                updatedAt: Date.now() - DORMANT_SESSION_EXPIRATION_MS - 1000,
            });
            await storage.create(session);

            await storage.cleanupExpired();

            const retrieved = await storage.get(session.userId, session.sessionId);
            expect(retrieved).toBeNull();
        });
    });
});
