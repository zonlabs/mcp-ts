import { test, expect } from '@playwright/test';
import { NeonStorageBackend } from '../../src/server/storage/neon-backend';
import { createMockSession, createMockTokens } from '../test-utils';
import { DORMANT_SESSION_EXPIRATION_MS, STATE_EXPIRATION_MS } from '../../src/shared/constants';
import type { SessionStatus, StoredMcpServerOptions } from '../../src/server/storage/types';

type NeonRow = {
    id: string;
    session_id: string;
    user_id: string;
    server_id?: string;
    server_name?: string;
    server_url: string;    server_options?: StoredMcpServerOptions | null;
    callback_url: string;
    created_at: string;
    updated_at: string;
    expires_at: string | null;
    status: SessionStatus;
    headers?: Record<string, string>;
    auth_url?: string | null;
    tool_policy?: unknown;
    client_information?: unknown;
    tokens?: unknown;
    code_verifier?: unknown;
    client_id?: string | null;
    oauth_state?: unknown;
};

function createMockNeonSql() {
    let sessions: NeonRow[] = [];
    let simulateMissingTable = false;

    const query = async (text: string, params: unknown[] = []) => {
        const normalized = text.replace(/"/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

        if (normalized.includes('to_regclass')) {
            return [{ exists: simulateMissingTable ? null : 'public.mcp_sessions' }];
        }

        if (normalized.startsWith('insert into public.mcp_sessions')) {
            const sessionId = params[0] as string;
            const userId = params[1] as string;

            if (sessions.some((row) => row.session_id === sessionId)) {
                const error = new Error('duplicate key value violates unique constraint');
                (error as Error & { code?: string }).code = '23505';
                throw error;
            }

            const row: NeonRow = {
                id: `row-${sessions.length + 1}`,
                session_id: sessionId,
                user_id: userId,
                server_id: params[2] as string | undefined,
                server_name: params[3] as string | undefined,                server_url: params[4] as string,
                server_options: params[5] as StoredMcpServerOptions | null,
                callback_url: params[6] as string,
                created_at: params[7] as string,
                updated_at: params[8] as string,
                headers: params[9] as Record<string, string> | undefined,
                auth_url: params[10] as string | null,
                status: params[11] as SessionStatus,
                expires_at: params[12] as string | null,
            };

            if (params.length >= 14 && params[13] !== undefined) {
                row.tool_policy = params[13];
            }

            sessions.push(row);
            return [];
        }

        if (normalized.startsWith('update public.mcp_sessions')) {
            const isReturningId = normalized.includes('returning id');

            if (normalized.includes('set server_id')) {
                const whereUserId = params[params.length - 2] as string;
                const whereSessionId = params[params.length - 1] as string;
                const row = sessions.find((item) => item.user_id === whereUserId && item.session_id === whereSessionId);
                if (!row) {
                    return isReturningId ? [] : [];
                }

                row.server_id = params[0] as string | undefined;
                row.server_name = params[1] as string | undefined;
                row.server_url = params[2] as string;                row.server_options = params[3] as StoredMcpServerOptions | null;
                row.callback_url = params[4] as string;
                row.status = params[5] as SessionStatus;
                row.headers = params[6] as Record<string, string> | undefined;
                row.auth_url = params[7] as string | null;
                row.expires_at = params[8] as string | null;

                if (params.length >= 11 && params[9] !== undefined) {
                    row.tool_policy = params[9];
                }

                row.updated_at = new Date().toISOString();
                return isReturningId ? [{ id: row.id }] : [];
            }

            if (normalized.includes('set client_information') || normalized.includes('set tokens') || normalized.includes('set code_verifier')) {
                const whereUserId = params[params.length - 2] as string;
                const whereSessionId = params[params.length - 1] as string;
                const row = sessions.find((item) => item.user_id === whereUserId && item.session_id === whereSessionId);
                if (!row) {
                    return isReturningId ? [] : [];
                }

                const columnPatterns = [
                    { col: 'client_information', key: 'client_information' },
                    { col: 'tokens', key: 'tokens' },
                    { col: 'code_verifier', key: 'code_verifier' },
                    { col: 'client_id', key: 'client_id' },
                    { col: 'oauth_state', key: 'oauth_state' },
                ];

                if (params.length === 2) {
                    for (const { col, key } of columnPatterns) {
                        if (normalized.includes(`${col} = null`)) {
                            (row as any)[key] = null;
                        }
                    }
                } else {
                    let paramIdx = 0;
                    for (const { col, key } of columnPatterns) {
                        if (normalized.includes(`${col} = `)) {
                            (row as any)[key] = params[paramIdx++];
                        }
                    }
                }

                row.updated_at = new Date().toISOString();
                return isReturningId ? [{ id: row.id }] : [];
            }

            if (normalized.includes('set expires_at')) {
                const [expiresAt, userId, sessionId] = params;
                const row = sessions.find((item) => item.user_id === userId && item.session_id === sessionId);
                if (row) {
                    row.expires_at = expiresAt as string;
                    row.updated_at = new Date().toISOString();
                }
                return [];
            }

            throw new Error(`Unexpected query: ${text}`);
        }

        if (normalized.startsWith('select * from public.mcp_sessions where user_id = $1 and session_id = $2')) {
            const [userId, sessionId] = params;
            return sessions.filter((row) => row.user_id === userId && row.session_id === sessionId);
        }

        if (normalized.startsWith('select session_id') && normalized.startsWith('select session_id,') && normalized.includes('from public.mcp_sessions where user_id = $1 and session_id = $2')) {
            const [userId, sessionId] = params;
            const rows = sessions.filter((row) => row.user_id === userId && row.session_id === sessionId);
            return rows.map((row) => {
                const result: Record<string, unknown> = {};
                if (normalized.includes('session_id')) result.session_id = row.session_id;
                if (normalized.includes('user_id')) result.user_id = row.user_id;
                if (normalized.includes('server_id')) result.server_id = row.server_id;
                if (normalized.includes('server_name')) result.server_name = row.server_name;
                if (normalized.includes('server_url')) result.server_url = row.server_url;
                                if (normalized.includes('callback_url')) result.callback_url = row.callback_url;
                if (normalized.includes('created_at')) result.created_at = row.created_at;
                if (normalized.includes('updated_at')) result.updated_at = row.updated_at;
                if (normalized.includes('expires_at')) result.expires_at = row.expires_at;
                if (normalized.includes('headers')) result.headers = row.headers;
                if (normalized.includes('auth_url')) result.auth_url = row.auth_url;
                if (normalized.includes('status')) result.status = row.status;
                if (normalized.includes('tool_policy')) result.tool_policy = row.tool_policy;
                                                                                if (normalized.includes('server_options')) result.server_options = row.server_options;
                return result;
            });
        }

        if (normalized.startsWith('select client_information') && normalized.includes('from public.mcp_sessions where user_id = $1 and session_id = $2')) {
            const [userId, sessionId] = params;
            const row = sessions.find((item) => item.user_id === userId && item.session_id === sessionId);
            if (!row) return [];
            const result: Record<string, unknown> = {};
            if (normalized.includes('client_information')) result.client_information = row.client_information;
            if (normalized.includes(', tokens')) result.tokens = row.tokens;
            if (normalized.includes('code_verifier,') || normalized.includes('code_verifier ')) result.code_verifier = row.code_verifier;
            if (normalized.includes('client_id')) result.client_id = row.client_id;
            if (normalized.includes('oauth_state')) result.oauth_state = row.oauth_state;
            return [result];
        }

        if (normalized.startsWith('select id from public.mcp_sessions where user_id = $1 and session_id = $2')) {
            const [userId, sessionId] = params;
            return sessions
                .filter((row) => row.user_id === userId && row.session_id === sessionId)
                .map((row) => ({ id: row.id }));
        }

        if (normalized.startsWith('select * from public.mcp_sessions where user_id = $1')) {
            const [userId] = params;
            return sessions.filter((row) => row.user_id === userId);
        }

        if (normalized.startsWith('select session_id from public.mcp_sessions where user_id = $1')) {
            const [userId] = params;
            return sessions
                .filter((row) => row.user_id === userId)
                .map((row) => ({ session_id: row.session_id }));
        }

        if (normalized.startsWith('select session_id from public.mcp_sessions')) {
            return sessions.map((row) => ({ session_id: row.session_id }));
        }

        if (normalized.startsWith('delete from public.mcp_sessions where user_id = $1 and session_id = $2')) {
            const [userId, sessionId] = params;
            sessions = sessions.filter((row) => !(row.user_id === userId && row.session_id === sessionId));
            return [];
        }

        if (normalized.startsWith('delete from public.mcp_sessions where expires_at is not null')) {
            const [expiresAt] = params;
            sessions = sessions.filter((row) => (
                row.status === 'active' ||
                row.expires_at === null ||
                new Date(row.expires_at).getTime() >= new Date(expiresAt as string).getTime()
            ));
            return [];
        }

        if (normalized.startsWith("delete from public.mcp_sessions where status = 'active'")) {
            const [updatedAt] = params;
            sessions = sessions.filter((row) => (
                row.status !== 'active' ||
                new Date(row.updated_at).getTime() >= new Date(updatedAt as string).getTime()
            ));
            return [];
        }

        if (normalized.startsWith('delete from public.mcp_sessions')) {
            sessions = [];
            return [];
        }

        throw new Error(`Unexpected query: ${text}`);
    };

    return {
        sql: { query },
        listSessions: () => sessions,
        setMissingTable: (value: boolean) => {
            simulateMissingTable = value;
        },
    };
}

test.describe('NeonStorageBackend', () => {
    let mockNeon: ReturnType<typeof createMockNeonSql>;
    let storage: NeonStorageBackend;

    test.beforeEach(() => {
        mockNeon = createMockNeonSql();
        storage = new NeonStorageBackend(mockNeon.sql);
    });

    test('initializes when the mcp_sessions table exists', async () => {
        await expect(storage.init()).resolves.toBeUndefined();
    });

    test('throws a helpful error when the mcp_sessions table is missing', async () => {
        mockNeon.setMissingTable(true);

        await expect(storage.init()).rejects.toThrow(/Table "mcp_sessions" not found/);
        await expect(storage.init()).rejects.toThrow(/Neon storage guide/);
    });

    test('stores and retrieves a session', async () => {
        const oauthState = {
            nonce: 'nonce-1',
            sessionId: 'test-session-123',
            serverId: 'test-server',
            createdAt: Date.now(),
        };
        const tokens = createMockTokens();
        const session = createMockSession({ headers: { Authorization: 'Bearer test' } });

        await storage.create(session);
        await storage.patchCredentials(session.userId, session.sessionId, { tokens, oauthState });

        const retrieved = await storage.get(session.userId, session.sessionId);
        const credentials = await storage.getCredentials(session.userId, session.sessionId);
        expect(retrieved?.sessionId).toBe(session.sessionId);
        expect(retrieved?.userId).toBe(session.userId);
        expect((retrieved as any)?.tokens).toBeUndefined();
        expect(credentials?.tokens).toEqual(tokens);
        expect(retrieved?.headers).toEqual(session.headers);
        expect(credentials?.oauthState).toEqual(oauthState);
    });

    test('throws if a session already exists', async () => {
        const session = createMockSession();
        await storage.create(session);

        await expect(storage.create(session)).rejects.toThrow('already exists');
    });

    test('updates partial session data while preserving unchanged fields', async () => {
        const session = createMockSession();
        await storage.create(session);

        const tokens = createMockTokens({ access_token: 'refreshed-token' });
        await storage.update(session.userId, session.sessionId, { status: 'pending', serverOptions: { transport: { type: 'streamable-http' } } });
        await storage.patchCredentials(session.userId, session.sessionId, { tokens });

        const retrieved = await storage.get(session.userId, session.sessionId);
        const credentials = await storage.getCredentials(session.userId, session.sessionId);
        expect(retrieved?.status).toBe('pending');
        expect((retrieved as any)?.tokens).toBeUndefined();
        expect(credentials?.tokens).toEqual(tokens);
        expect(retrieved?.serverOptions?.transport?.type).toBe('streamable-http');
        expect(retrieved?.serverOptions?.transport).toEqual({ type: 'streamable-http' });
        expect(retrieved?.serverUrl).toBe(session.serverUrl);
    });

    test('throws when updating a missing session', async () => {
        await expect(
            storage.update('missing-user', 'missing-session', { status: 'active' })
        ).rejects.toThrow('not found');
    });

    test('lists, removes, clears, and cleans up sessions', async () => {
        await storage.create(createMockSession({ sessionId: 'a', userId: 'user-a' }));
        await storage.create(createMockSession({
            sessionId: 'b',
            userId: 'user-a',
            status: 'pending',
            createdAt: Date.now() - STATE_EXPIRATION_MS - 1000,
        }));
        await storage.create(createMockSession({ sessionId: 'c', userId: 'user-b' }));

        expect((await storage.listIds('user-a')).sort()).toEqual(['a', 'b']);
        expect((await storage.listAllIds()).sort()).toEqual(['a', 'b', 'c']);

        await storage.cleanupExpired();
        expect((await storage.listAllIds()).sort()).toEqual(['a', 'c']);

        await storage.delete('user-a', 'a');
        expect(await storage.get('user-a', 'a')).toBeNull();

        await storage.clearAll();
        expect(await storage.list('user-b')).toEqual([]);
        expect(mockNeon.listSessions()).toEqual([]);
    });

    // ── generateSessionId ────────────────────────────────────────────────
    test.describe('generateSessionId', () => {
        test('generates unique UUIDs', () => {
            const id1 = storage.generateSessionId();
            const id2 = storage.generateSessionId();
            expect(id1).not.toBe(id2);
            expect(id1).toMatch(/^sess_[a-zA-Z0-9_-]{21}$/);
        });
    });

    // ── create field mapping ─────────────────────────────────────────────
    test.describe('create', () => {
        test('maps all Session fields to snake_case columns', async () => {
            const session = createMockSession();
            await storage.create(session);

            const rows = mockNeon.listSessions();
            expect(rows.length).toBe(1);
            const row = rows[0];
            expect(row.session_id).toBe(session.sessionId);
            expect(row.user_id).toBe(session.userId);
            expect(row.server_id).toBe(session.serverId);
            expect(row.server_name).toBe(session.serverName);
            expect(row.server_url).toBe(session.serverUrl);
            expect(row.server_options?.transport?.type).toBe(session.serverOptions?.transport?.type);
            expect(row.server_options?.transport).toEqual({ type: session.serverOptions?.transport?.type });
            expect(row.callback_url).toBe(session.callbackUrl);
            expect(row.status).toBe(session.status);
        });

        test('sets short expires_at for pending sessions', async () => {
            const before = Date.now();
            await storage.create(createMockSession({ status: 'pending' }));

            const rows = mockNeon.listSessions();
            const expiresMs = new Date(rows[0].expires_at!).getTime();
            expect(expiresMs).toBeGreaterThanOrEqual(before + STATE_EXPIRATION_MS - 100);
            expect(expiresMs).toBeLessThanOrEqual(Date.now() + STATE_EXPIRATION_MS + 100);
        });

        test('leaves expires_at null for active sessions', async () => {
            await storage.create(createMockSession({ status: 'active' }));

            const rows = mockNeon.listSessions();
            expect(rows[0].expires_at).toBeNull();
        });

        test('keeps headers on session and tokens in credentials', async () => {
            const tokens = createMockTokens();
            const oauthState = {
                nonce: 'nonce-1',
                sessionId: 'test-session-123',
                serverId: 'test-server',
                createdAt: Date.now(),
            };
            const session = createMockSession({ headers: { Authorization: 'Bearer xyz' } });
            await storage.create(session);
            await storage.patchCredentials(session.userId, session.sessionId, { tokens, oauthState });

            const sessionRows = mockNeon.listSessions();
            // get without credentials should not return tokens
            const retrieved = await storage.get(session.userId, session.sessionId);
            expect((retrieved as any).tokens).toBeUndefined();
            expect(sessionRows[0].headers).toEqual({ Authorization: 'Bearer xyz' });
            // getCredentials should return tokens
            const credentials = await storage.getCredentials(session.userId, session.sessionId);
            expect(credentials?.tokens).toEqual(tokens);
            expect(credentials?.oauthState).toEqual(oauthState);
        });
    });

    // ── get ──────────────────────────────────────────────────────────────
    test.describe('get', () => {
        test('maps DB row back to camelCase Session correctly', async () => {
            const session = createMockSession();
            await storage.create(session);

            const result = await storage.get(session.userId, session.sessionId);
            expect(result).not.toBeNull();
            expect(result?.sessionId).toBe(session.sessionId);
            expect(result?.serverId).toBe(session.serverId);
            expect(result?.serverName).toBe(session.serverName);
            expect(result?.serverUrl).toBe(session.serverUrl);
            expect(result?.serverOptions?.transport?.type).toBe(session.serverOptions?.transport?.type);
            expect(result?.callbackUrl).toBe(session.callbackUrl);
            expect(result?.userId).toBe(session.userId);
            expect(result?.status).toBe(session.status);
            expect(typeof result?.createdAt).toBe('number');
        });

        test('returns null when session does not exist', async () => {
            expect(await storage.get('ghost', 'ghost')).toBeNull();
        });

        test('does not leak sessions across userIds', async () => {
            await storage.create(createMockSession({ sessionId: 'a', userId: 'user-a' }));
            await storage.create(createMockSession({ sessionId: 'b', userId: 'user-b' }));

            expect(await storage.get('user-a', 'b')).toBeNull();
        });
    });

    // ── delete ───────────────────────────────────────────────────────────
    test.describe('delete', () => {
        test('does not remove other sessions belonging to the same userId', async () => {
            const userId = 'multi-user';
            await storage.create(createMockSession({ sessionId: 's1', userId }));
            await storage.create(createMockSession({ sessionId: 's2', userId }));

            await storage.delete(userId, 's1');

            const remaining = await storage.listIds(userId);
            expect(remaining).toEqual(['s2']);
        });
    });

    // ── listIds ──────────────────────────────────────────────────────────
    test.describe('listIds', () => {
        test('returns only session IDs (not full objects)', async () => {
            const userId = 'slim-user';
            await storage.create(createMockSession({ sessionId: 'id-a', userId }));
            await storage.create(createMockSession({ sessionId: 'id-b', userId }));

            const ids = await storage.listIds(userId);
            expect(ids.sort()).toEqual(['id-a', 'id-b']);
        });
    });

    // ── clearCredentials ─────────────────────────────────────────────────
    test.describe('clearCredentials', () => {
        test('removes credentials while session remains intact', async () => {
            const session = createMockSession();
            const tokens = createMockTokens();
            await storage.create(session);
            await storage.patchCredentials(session.userId, session.sessionId, { tokens });

            const credentialsBefore = await storage.getCredentials(session.userId, session.sessionId);
            expect(credentialsBefore?.tokens).not.toBeUndefined();

            await storage.clearCredentials(session.userId, session.sessionId);

            const credentials = await storage.getCredentials(session.userId, session.sessionId);
            const retrieved = await storage.get(session.userId, session.sessionId);
            expect(credentials?.tokens).toBeNull();
            expect(retrieved).not.toBeNull();
        });
    });

    // ── update credential ops ────────────────────────────────────────────
    test.describe('update', () => {
        test('clears OAuth tokens when credentials are invalidated', async () => {
            const session = createMockSession();
            await storage.create(session);
            await storage.patchCredentials(session.userId, session.sessionId, { tokens: createMockTokens() });

            await storage.patchCredentials(session.userId, session.sessionId, { tokens: null });

            const credentials = await storage.getCredentials(session.userId, session.sessionId);
            expect(credentials?.tokens).toBeNull();
        });

        test('promotion to active clears expires_at', async () => {
            const session = createMockSession({ status: 'pending' });
            await storage.create(session);
            expect(mockNeon.listSessions()[0].expires_at).not.toBeNull();

            await storage.update(session.userId, session.sessionId, { status: 'active' });

            const row = mockNeon.listSessions()[0];
            expect(row.expires_at).toBeNull();
        });
    });

    // ── cleanupExpired (dormant active) ──────────────────────────────────
    test.describe('cleanupExpired', () => {
        test('deletes dormant active sessions by updated_at', async () => {
            await storage.create(createMockSession({
                sessionId: 'dormant',
                status: 'active',
                updatedAt: Date.now() - DORMANT_SESSION_EXPIRATION_MS - 1000,
            }));

            await storage.cleanupExpired();

            expect(mockNeon.listSessions()).toEqual([]);
        });
    });

    // ── disconnect ───────────────────────────────────────────────────────
    test.describe('disconnect', () => {
        test('resolves cleanly (no persistent connection to close)', async () => {
            await expect(storage.disconnect()).resolves.toBeUndefined();
        });
    });
});
