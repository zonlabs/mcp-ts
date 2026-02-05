/**
 * Tests for SqliteStorage
 */
import { test, expect } from '@playwright/test';
import { SqliteStorage } from '../../src/server/storage/sqlite-backend';
import { createMockSession, createMockTokens } from '../test-utils';
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

    test.describe('createSession', () => {
        test('should store session data in sqlite', async () => {
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

    test.describe('cleanupExpiredSessions', () => {
        test('should remove expired sessions', async () => {
            const session = createMockSession();
            await storage.createSession(session, -1); // Expired immediately (ttl -1)
            await storage.cleanupExpiredSessions();

            const retrieved = await storage.getSession(session.identity, session.sessionId);
            expect(retrieved).toBeNull();
        });

        test('should keep active sessions', async () => {
            const session = createMockSession();
            await storage.createSession(session, 100);

            await storage.cleanupExpiredSessions();

            const retrieved = await storage.getSession(session.identity, session.sessionId);
            expect(retrieved).toBeDefined();
        });
    });
});
