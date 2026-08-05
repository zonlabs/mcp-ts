import { test, expect } from '@playwright/test';
import { SupabaseStorageBackend } from '../../src/server/storage/supabase-backend';
import { createMockSession, createMockTokens } from '../test-utils';
import { DORMANT_SESSION_EXPIRATION_MS, STATE_EXPIRATION_MS } from '../../src/shared/constants';

/**
 * A mock Supabase client that faithfully simulates the fluent builder API:
 *   .from(table).update(data).eq(k,v).eq(k,v).select('id')
 *
 * Key insight: .select() called AFTER .update()/.delete() does NOT switch the
 * action — it sets `selectAfterMutation = true` so we return matched rows.
 */
function createMockSupabaseClient() {
    let sessions: any[] = [];
    let simulateMissingTable = false;

    const mock = {
        /** Test-only helper to inspect internal state */
        _listSessions: () => sessions,
        get _simulateMissingTable() { return simulateMissingTable; },
        set _simulateMissingTable(v: boolean) { simulateMissingTable = v; },

        from: (table: string) => {
            let action: 'insert' | 'upsert' | 'update' | 'select' | 'delete' | 'init_check' | null = null;
            let payload: any = null;
            const filters: Array<(item: any) => boolean> = [];
            let selectedColumns: string | null = null;
            let selectAfterMutation = false;
            const getRows = () => sessions;
            const setRows = (rows: any[]) => {
                sessions = rows;
            };

            const stripCredentialColumns = (row: any) => {
                const { client_information, tokens, code_verifier, client_id, oauth_state, ...rest } = row;
                return rest;
            };

            const chain: any = {
                insert: (data: any) => { action = 'insert'; payload = { ...data }; return chain; },
                upsert: (data: any) => { action = 'upsert'; payload = { ...data }; return chain; },
                update: (data: any) => { action = 'update'; payload = { ...data }; return chain; },
                delete: () => { action = 'delete'; return chain; },
                select: (_cols?: any) => {
                    if (typeof _cols === 'string') {
                        selectedColumns = _cols;
                    }
                    // Specific check for init() validation: select('session_id').limit(0)
                    if (_cols === 'session_id' && payload === 'limit_zero_check') {
                        action = 'init_check';
                    } else if (action === 'update' || action === 'delete') {
                        selectAfterMutation = true;
                    } else {
                        action = 'select';
                    }
                    return chain;
                },
                limit: (n: number) => { 
                    if (n === 0) payload = 'limit_zero_check'; 
                    return chain; 
                },
                eq:  (k: string, v: any) => { filters.push(row => row[k] === v);  return chain; },
                neq: (k: string, v: any) => { filters.push(row => row[k] !== v);  return chain; },
                not: (k: string, op: string, v: any) => {
                    if (op === 'is' && v === null) {
                        filters.push(row => row[k] !== null && row[k] !== undefined);
                    } else if (op === 'is') {
                        filters.push(row => row[k] !== v);
                    }
                    return chain;
                },
                lt:  (k: string, v: any) => {
                    filters.push(row => new Date(row[k]).getTime() < new Date(v).getTime());
                    return chain;
                },

                /** Used by getSession */
                maybeSingle: async () => {
                    let res = [...getRows()];
                    for (const f of filters) res = res.filter(f);
                    const row = res[0] ?? null;
                    if (row && selectedColumns !== null && selectedColumns !== '*' && selectedColumns.startsWith('session_id')) {
                        return { data: stripCredentialColumns(row), error: null };
                    }
                    return { data: row, error: null };
                },

                /**
                 * Makes the chain awaitable — mimics the real Supabase PromiseLike
                 */
                then: (resolve: (v: any) => void, reject?: (e: any) => void) => {
                    try {
                        // Determine if this is actually our init_check based on column choice + limit
                        if (action === 'select' && payload === 'limit_zero_check') {
                            action = 'init_check';
                        }

                        if (action === 'insert') {
                            const rows = getRows();
                            const duplicate = rows.some(s => s.session_id === payload.session_id);
                            if (duplicate) {
                                return resolve({ data: null, error: { code: '23505', message: 'duplicate key violation' } });
                            }
                            rows.push({ ...payload });
                            return resolve({ data: [payload], error: null });

                        } else if (action === 'upsert') {
                            const rows = getRows();
                            const existing = rows.find(s => s.user_id === payload.user_id && s.session_id === payload.session_id);
                            if (existing) {
                                Object.assign(existing, payload);
                            } else {
                                rows.push({ ...payload });
                            }
                            return resolve({ data: [payload], error: null });

                        } else if (action === 'update') {
                            const matched = getRows().filter(s => filters.every(f => f(s)));
                            matched.forEach(s => Object.assign(s, payload));
                            return resolve({ data: selectAfterMutation ? matched : null, error: null });

                        } else if (action === 'delete') {
                            const rows = getRows();
                            const before = rows.length;
                            const nextRows = rows.filter(s => !filters.every(f => f(s)));
                            setRows(nextRows);
                            const removed = before - nextRows.length;
                            return resolve({ data: selectAfterMutation ? Array(removed).fill(null) : null, error: null });

                        } else if (action === 'init_check') {
                            if (simulateMissingTable) {
                                return resolve({ data: null, error: { code: '42P01', message: 'relation "mcp_sessions" does not exist' } });
                            }
                            return resolve({ data: [], error: null });

                        } else if (action === 'select') {
                            let res = getRows().filter(s => filters.every(f => f(s)));
                            if (selectedColumns !== null && selectedColumns !== '*' && selectedColumns.startsWith('session_id')) {
                                res = res.map(r => stripCredentialColumns(r));
                            }
                            return resolve({ data: res, error: null });

                        } else {
                            return resolve({ data: null, error: new Error('Unknown action') });
                        }
                    } catch (err) {
                        reject ? reject(err) : resolve({ data: null, error: err });
                    }
                },
            };
            return chain;
        },
    };
    return mock;
}

// ─────────────────────────────────────────────────────────────────────────────
// Test Suite
// ─────────────────────────────────────────────────────────────────────────────
test.describe('SupabaseStorageBackend', () => {
    let mockSupabase: any;
    let storage: SupabaseStorageBackend;

    test.beforeEach(() => {
        mockSupabase = createMockSupabaseClient();
        storage    = new SupabaseStorageBackend(mockSupabase);
    });

    // ── init ─────────────────────────────────────────────────────────────────
    test.describe('init', () => {
        test('resolves when table exists', async () => {
            await expect(storage.init()).resolves.toBeUndefined();
        });

        test('throws descriptive error when table is missing', async () => {
            mockSupabase._simulateMissingTable = true;
            await expect(storage.init()).rejects.toThrow(/Table "mcp_sessions" not found/);
            await expect(storage.init()).rejects.toThrow(/npx mcp-ts supabase-init/);
        });
    });

    // ── generateSessionId ────────────────────────────────────────────────────
    test.describe('generateSessionId', () => {
        test('generates unique UUIDs', () => {
            const id1 = storage.generateSessionId();
            const id2 = storage.generateSessionId();
            expect(id1).not.toBe(id2);
            // 26-char pattern: sess_ + 21-char nanoid
            expect(id1).toMatch(/^sess_[a-zA-Z0-9_-]{21}$/);
        });
    });

    // ── create ───────────────────────────────────────────────────────────────
    test.describe('create', () => {
        test('maps all Session fields to snake_case columns', async () => {
            const session = createMockSession();
            await storage.create(session);

            const row = mockSupabase._listSessions()[0];
            expect(row.session_id).toBe(session.sessionId);
            expect(row.user_id).toBe(session.userId);
            expect(row.server_id).toBe(session.serverId);
            expect(row.server_name).toBe(session.serverName);
            expect(row.server_url).toBe(session.serverUrl);
            expect(row.server_options?.transport?.type).toBe(session.serverOptions?.transport?.type);
            expect(row.server_options?.transport).toEqual({ type: session.serverOptions?.transport?.type });
            expect(row.callback_url).toBe(session.callbackUrl);
            expect(row.status).toBe(session.status);
            expect(row.tokens).toBeUndefined();
            expect(row.client_information).toBeUndefined();
            expect(row.code_verifier).toBeUndefined();
        });

        test('sets short expires_at for pending sessions', async () => {
            const before = Date.now();
            await storage.create(createMockSession({ status: 'pending' }));

            const row = mockSupabase._listSessions()[0];
            const expiresMs = new Date(row.expires_at).getTime();
            expect(expiresMs).toBeGreaterThanOrEqual(before + STATE_EXPIRATION_MS - 100);
            expect(expiresMs).toBeLessThanOrEqual(Date.now() + STATE_EXPIRATION_MS + 100);
        });

        test('leaves expires_at null for active sessions', async () => {
            await storage.create(createMockSession({ status: 'active' }));

            const row = mockSupabase._listSessions()[0];
            expect(row.expires_at).toBeNull();
        });

        test('keeps headers on session and stores credentials via patch', async () => {
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

            const retrieved = await storage.get(session.userId, session.sessionId);
            const credentials = await storage.getCredentials(session.userId, session.sessionId);
            expect((retrieved as any).tokens).toBeUndefined();
            expect(retrieved?.headers).toEqual({ Authorization: 'Bearer xyz' });
            expect(credentials?.tokens).toEqual(tokens);
            expect(credentials?.oauthState).toEqual(oauthState);
        });

        test('throws on duplicate session (unique key violation)', async () => {
            const session = createMockSession();
            await storage.create(session);
            await expect(storage.create(session)).rejects.toThrow('already exists');
        });
    });

    // ── update ───────────────────────────────────────────────────────────────
    test.describe('update', () => {
        test('updates partial fields and preserves unchanged ones', async () => {
            const session = createMockSession();
            await storage.create(session);

            const newTokens = createMockTokens();
            await storage.update(session.userId, session.sessionId, { status: 'active', serverOptions: { transport: { type: 'streamable-http' } } });
            await storage.patchCredentials(session.userId, session.sessionId, { tokens: newTokens });

            const retrieved = await storage.get(session.userId, session.sessionId);
            const credentials = await storage.getCredentials(session.userId, session.sessionId);
            // Updated
            expect(retrieved?.status).toBe('active');
            expect((retrieved as any)?.tokens).toBeUndefined();
            expect(credentials?.tokens).toEqual(newTokens);
            expect(retrieved?.serverOptions?.transport?.type).toBe('streamable-http');
            expect(retrieved?.serverOptions?.transport).toEqual({ type: 'streamable-http' });
            // Preserved
            expect(retrieved?.serverId).toBe(session.serverId);
            expect(retrieved?.serverUrl).toBe(session.serverUrl);
            expect(retrieved?.userId).toBe(session.userId);
        });

        test('handles OAuth token refresh safely', async () => {
            const session = createMockSession();
            await storage.create(session);

            const refreshed = createMockTokens({
                access_token:  'new-access-token',
                refresh_token: 'new-refresh-token',
            });
            await storage.patchCredentials(session.userId, session.sessionId, { tokens: refreshed });

            const credentials = await storage.getCredentials(session.userId, session.sessionId);
            expect(credentials?.tokens?.access_token).toBe('new-access-token');
            expect(credentials?.tokens?.refresh_token).toBe('new-refresh-token');
        });

        test('clears OAuth tokens when credentials are invalidated', async () => {
            const session = createMockSession();
            await storage.create(session);
            await storage.patchCredentials(session.userId, session.sessionId, { tokens: createMockTokens() });

            await storage.patchCredentials(session.userId, session.sessionId, { tokens: null });

            const credentials = await storage.getCredentials(session.userId, session.sessionId);

            expect(credentials?.tokens).toBeNull();
        });

        test('promotion to active clears pending expires_at', async () => {
            const session = createMockSession({ status: 'pending' });
            await storage.create(session);
            expect(mockSupabase._listSessions()[0].expires_at).not.toBeNull();

            await storage.update(session.userId, session.sessionId, { status: 'active' });

            const row = mockSupabase._listSessions()[0];
            expect(row.expires_at).toBeNull();
        });

        test('throws if session does not exist', async () => {
            await expect(
                storage.update('no-user', 'no-session', { status: 'active' })
            ).rejects.toThrow('not found');
        });
    });

    // ── get ──────────────────────────────────────────────────────────────────
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
            const a = createMockSession({ sessionId: 'a', userId: 'user-a' });
            const b = createMockSession({ sessionId: 'b', userId: 'user-b' });
            await storage.create(a);
            await storage.create(b);

            // user-a queries for user-b's session ID → should get null
            expect(await storage.get('user-a', 'b')).toBeNull();
        });
    });

    // ── delete ───────────────────────────────────────────────────────────────
    test.describe('delete', () => {
        test('deletes the session so it can no longer be retrieved', async () => {
            const session = createMockSession();
            await storage.create(session);
            await storage.delete(session.userId, session.sessionId);
            expect(await storage.get(session.userId, session.sessionId)).toBeNull();
        });

        test('does not remove other sessions belonging to the same userId', async () => {
            const userId = 'multi-user';
            await storage.create(createMockSession({ sessionId: 's1', userId }));
            await storage.create(createMockSession({ sessionId: 's2', userId }));

            await storage.delete(userId, 's1');

            const remaining = await storage.listIds(userId);
            expect(remaining).toEqual(['s2']);
        });
    });

    // ── list ──────────────────────────────────────────────────────
    test.describe('list', () => {
        test('returns all full Session objects for the userId', async () => {
            const userId = 'owner';
            await storage.create(createMockSession({ sessionId: 'x1', userId }));
            await storage.create(createMockSession({ sessionId: 'x2', userId, serverName: 'Alt Server' }));
            // Another user — must NOT appear
            await storage.create(createMockSession({ sessionId: 'x3', userId: 'intruder' }));

            const sessions = await storage.list(userId);
            expect(sessions.length).toBe(2);
            expect(sessions.map(s => s.sessionId)).toContain('x1');
            expect(sessions.map(s => s.sessionId)).toContain('x2');
        });

        test('returns empty array for userId with no sessions', async () => {
            expect(await storage.list('nobody')).toEqual([]);
        });
    });

    // ── listIds ────────────────────────────────────────────────────
    test.describe('listIds', () => {
        test('returns only session IDs (not full objects)', async () => {
            const userId = 'slim-user';
            await storage.create(createMockSession({ sessionId: 'id-a', userId }));
            await storage.create(createMockSession({ sessionId: 'id-b', userId }));

            const ids = await storage.listIds(userId);
            expect(ids.sort()).toEqual(['id-a', 'id-b']);
        });
    });

    // ── listAllIds ───────────────────────────────────────────────────────────
    test.describe('listAllIds', () => {
        test('returns session IDs across ALL users', async () => {
            await storage.create(createMockSession({ sessionId: 'g1', userId: 'u1' }));
            await storage.create(createMockSession({ sessionId: 'g2', userId: 'u2' }));

            const ids = await storage.listAllIds();
            expect(ids).toContain('g1');
            expect(ids).toContain('g2');
            expect(ids.length).toBe(2);
        });
    });

    // ── clearAll ─────────────────────────────────────────────────────────────
    test.describe('clearAll', () => {
        test('wipes every session regardless of userId', async () => {
            await storage.create(createMockSession({ sessionId: 'c1', userId: 'u1' }));
            await storage.create(createMockSession({ sessionId: 'c2', userId: 'u2' }));

            await storage.clearAll();

            expect(await storage.listAllIds()).toEqual([]);
        });
    });

    // ── cleanupExpired ───────────────────────────────────────────────────────
    test.describe('cleanupExpired', () => {
        test('deletes rows where expires_at is in the past', async () => {
            await storage.create(createMockSession({ sessionId: 'alive', status: 'pending' }));
            await storage.create(createMockSession({
                sessionId: 'zombie',
                status: 'pending',
                createdAt: Date.now() - STATE_EXPIRATION_MS - 1000,
            }));

            await storage.cleanupExpired();

            const rows = mockSupabase._listSessions();
            expect(rows.length).toBe(1);
            expect(rows[0].session_id).toBe('alive');
        });

        test('is a no-op when there are no expired sessions', async () => {
            await storage.create(createMockSession({ sessionId: 'fresh' }));
            await storage.cleanupExpired();
            expect(mockSupabase._listSessions().length).toBe(1);
        });

        test('deletes dormant active sessions by updated_at', async () => {
            await storage.create(createMockSession({
                sessionId: 'dormant',
                status: 'active',
                updatedAt: Date.now() - DORMANT_SESSION_EXPIRATION_MS - 1000,
            }));

            await storage.cleanupExpired();

            expect(mockSupabase._listSessions()).toEqual([]);
        });
    });

    // ── disconnect ───────────────────────────────────────────────────────────
    test.describe('disconnect', () => {
        test('resolves cleanly (no persistent connection to close)', async () => {
            await expect(storage.disconnect()).resolves.toBeUndefined();
        });
    });
});
