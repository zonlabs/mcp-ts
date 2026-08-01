import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { sessions, _setStorageInstanceForTesting } from '../../src/server/storage';
import { createMockSession } from '../test-utils';

test.describe('storage index bootstrap', () => {
    const originalEnv = {
        MCP_TS_STORAGE_TYPE: process.env.MCP_TS_STORAGE_TYPE,
        MCP_TS_STORAGE_SQLITE_PATH: process.env.MCP_TS_STORAGE_SQLITE_PATH,
        MCP_TS_STORAGE_FILE: process.env.MCP_TS_STORAGE_FILE,
        NEON_DATABASE_URL: process.env.NEON_DATABASE_URL,
        REDIS_URL: process.env.REDIS_URL,
    };

    let dbPath: string;

    test.beforeEach(() => {
        dbPath = path.join(__dirname, `storage-index-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
        _setStorageInstanceForTesting(null);
        delete process.env.REDIS_URL;
        delete process.env.MCP_TS_STORAGE_FILE;
        delete process.env.NEON_DATABASE_URL;
    });

    test.afterEach(async () => {
        try {
            await sessions.disconnect();
        } catch {
            // Storage may not have been initialized for a given test.
        }

        _setStorageInstanceForTesting(null);
        process.env.MCP_TS_STORAGE_TYPE = originalEnv.MCP_TS_STORAGE_TYPE;
        process.env.MCP_TS_STORAGE_SQLITE_PATH = originalEnv.MCP_TS_STORAGE_SQLITE_PATH;
        process.env.MCP_TS_STORAGE_FILE = originalEnv.MCP_TS_STORAGE_FILE;
        process.env.NEON_DATABASE_URL = originalEnv.NEON_DATABASE_URL;
        process.env.REDIS_URL = originalEnv.REDIS_URL;

        for (const suffix of ['', '-journal', '-shm', '-wal']) {
            const filePath = `${dbPath}${suffix}`;
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }
    });

    test('awaits sqlite initialization before the first proxied operation', async () => {
        process.env.MCP_TS_STORAGE_TYPE = 'sqlite';
        process.env.MCP_TS_STORAGE_SQLITE_PATH = dbPath;

        const session = createMockSession({
            sessionId: 'sqlite-bootstrap-session',
            serverOptions: { transport: { type: 'streamable-http' } },
        });

        await sessions.create(session);

        const retrieved = await sessions.get(session.userId, session.sessionId);
        expect(retrieved?.sessionId).toBe(session.sessionId);
        expect(retrieved?.serverOptions?.transport?.type).toBe('streamable-http');
    });

    test('falls back to memory when explicit neon selection has no connection string', async () => {
        process.env.MCP_TS_STORAGE_TYPE = 'neon';

        const session = createMockSession({
            sessionId: 'neon-fallback-session',
            serverOptions: { transport: { type: 'streamable-http' } },
        });

        await sessions.create(session);

        const retrieved = await sessions.get(session.userId, session.sessionId);
        expect(retrieved?.sessionId).toBe(session.sessionId);
        expect(retrieved?.serverOptions?.transport?.type).toBe('streamable-http');
    });
});
