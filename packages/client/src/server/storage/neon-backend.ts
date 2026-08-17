import type { SessionStore, Session, SessionCredentials, GetOptions, SessionResult } from './types.js';
import type { SessionStatus } from './types.js';
import { DORMANT_SESSION_EXPIRATION_MS } from '../../shared/constants.js';
import { generateSessionId } from '../../shared/utils.js';
import { encryptObject, decryptObject } from './crypto.js';
import { resolveSessionExpiresAt } from './session-lifecycle.js';
import { normalizeToolPolicy } from './tool-policy.js';

export interface NeonStorageOptions {
    schema?: string;
    table?: string;
}

type NeonSql = {
    query(queryWithPlaceholders: string, params?: unknown[]): Promise<any[]>;
};

type NeonSessionRow = {
    id?: string;
    session_id: string;
    server_id?: string | null;
    server_name?: string | null;
    server_url: string;
    server_options?: unknown;
    callback_url: string;
    created_at: string | Date;
    updated_at?: string | Date | null;
    expires_at?: string | Date | null;
    user_id: string;
    headers?: unknown;
    auth_url?: string | null;
    status?: SessionStatus | null;
    tool_policy?: unknown;
    client_information?: unknown;
    tokens?: unknown;
    discovery_state?: unknown;
    code_verifier?: unknown;
    client_id?: string | null;
    oauth_state?: unknown;
    enabled?: boolean;
};

export class NeonStorageBackend implements SessionStore {
    private readonly tableName: string;

    constructor(
        private readonly sql: NeonSql,
        options: NeonStorageOptions = {}
    ) {
        const schema = options.schema || 'public';
        const table = options.table || 'mcp_sessions';
        this.tableName = `${this.quoteIdentifier(schema)}.${this.quoteIdentifier(table)}`;
    }

    async init(): Promise<void> {
        await this.assertTable(this.tableName, 'mcp_sessions');
    }

    private async assertTable(qualifiedName: string, displayName: string): Promise<void> {
        const [{ exists } = { exists: null }] = await this.sql.query(
            'SELECT to_regclass($1) AS exists',
            [qualifiedName.replace(/"/g, '')]
        ) as Array<{ exists: string | null }>;

        if (!exists) {
            throw new Error(
                `[NeonStorage] Table "${displayName}" not found in your database. ` +
                'Please create it using the Neon storage guide in docs/storage-backends/neon.md.'
            );
        }
    }

    generateSessionId(): string {
        return generateSessionId();
    }

    private quoteIdentifier(identifier: string): string {
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) {
            throw new Error(`Invalid Neon storage identifier: ${identifier}`);
        }
        return `"${identifier}"`;
    }

    private mapRowToSessionData(row: NeonSessionRow): Session {
        return {
            sessionId: row.session_id,
            serverId: row.server_id ?? undefined,
            serverName: row.server_name ?? undefined,
            serverUrl: row.server_url,
            serverOptions: row.server_options as Session['serverOptions'],
            callbackUrl: row.callback_url,
            createdAt: new Date(row.created_at).getTime(),
            updatedAt: new Date(row.updated_at ?? row.created_at).getTime(),
            expiresAt: row.expires_at ? new Date(row.expires_at).getTime() : null,
            userId: row.user_id,
            headers: decryptObject(row.headers),
            authUrl: row.auth_url ?? undefined,
            status: row.status ?? 'pending',
            toolPolicy: normalizeToolPolicy(row.tool_policy as Parameters<typeof normalizeToolPolicy>[0]),
            clientInformation: decryptObject(row.client_information),
            tokens: decryptObject(row.tokens),
            discoveryState: decryptObject(row.discovery_state),
            codeVerifier: decryptObject(row.code_verifier),
            clientId: row.client_id ?? undefined,
            oauthState: row.oauth_state as Session['oauthState'],
            enabled: row.enabled ?? true,
        };
    }

    private hasCredentialData(data: Partial<SessionCredentials>): boolean {
        return (
            'clientInformation' in data ||
            'tokens' in data ||
            'discoveryState' in data ||
            'codeVerifier' in data ||
            'clientId' in data ||
            'oauthState' in data
        );
    }

    async create(session: Session): Promise<void> {
        const { sessionId, userId } = session;
        if (!sessionId || !userId) throw new Error('userId and sessionId required');

        const status = session.status ?? 'pending';
        const createdAt = new Date(session.createdAt || Date.now()).toISOString();
        const updatedAt = new Date(session.updatedAt ?? session.createdAt ?? Date.now()).toISOString();
        const createdAtMs = new Date(createdAt).getTime();
        const expiresAt = resolveSessionExpiresAt(status, createdAtMs);
        const toolPolicy = normalizeToolPolicy(session.toolPolicy, createdAtMs);

        const columns: string[] = [
            'session_id', 'user_id', 'server_id', 'server_name',
            'server_url', 'server_options', 'callback_url',
            'created_at', 'updated_at', 'headers', 'auth_url',
            'status', 'expires_at',
        ];
        const values: unknown[] = [
            sessionId, userId, session.serverId, session.serverName,
            session.serverUrl, session.serverOptions ?? null, session.callbackUrl,
            createdAt, updatedAt, encryptObject(session.headers),
            session.authUrl ?? null, status,
            expiresAt === null ? null : new Date(expiresAt).toISOString(),
        ];

        if (toolPolicy) {
            columns.push('tool_policy');
            values.push(toolPolicy);
        }

        const placeholders = values.map((_, i) => `$${i + 1}`);

        try {
            await this.sql.query(
                `INSERT INTO ${this.tableName} (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`,
                values
            );
        } catch (error: any) {
            if (error.code === '23505') {
                throw new Error(`Session ${sessionId} already exists`);
            }
            throw new Error(`Failed to create session in Neon: ${error.message}`);
        }

    }

    async update(userId: string, sessionId: string, data: Partial<Session>): Promise<void> {
        const currentSession = await this.get(userId, sessionId);
        if (!currentSession) {
            throw new Error(`Session ${sessionId} not found for userId ${userId}`);
        }

        const updatedSession = { ...currentSession, ...data };
        const status = updatedSession.status ?? 'pending';
        const expiresAt = resolveSessionExpiresAt(status);

        const shouldUpdateSession = (
            'serverId' in data ||
            'serverName' in data ||
            'serverUrl' in data ||
            'serverOptions' in data ||
            'callbackUrl' in data ||
            'status' in data ||
            'headers' in data ||
            'authUrl' in data ||
            'toolPolicy' in data ||
            'enabled' in data
        );

        if (shouldUpdateSession) {
            const setClauses: string[] = [];
            const values: unknown[] = [];
            let paramIndex = 1;

            const addSet = (column: string, value: unknown) => {
                setClauses.push(`${column} = $${paramIndex++}`);
                values.push(value);
            };

            addSet('server_id', updatedSession.serverId);
            addSet('server_name', updatedSession.serverName);
            addSet('server_url', updatedSession.serverUrl);
            addSet('server_options', updatedSession.serverOptions ?? null);
            addSet('callback_url', updatedSession.callbackUrl);
            addSet('status', status);
            addSet('headers', encryptObject(updatedSession.headers));
            addSet('auth_url', updatedSession.authUrl ?? null);
            addSet('expires_at', expiresAt === null ? null : new Date(expiresAt).toISOString());

            if ('toolPolicy' in data) {
                const policyUpdatedAt = updatedSession.updatedAt ?? Date.now();
                const toolPolicy = normalizeToolPolicy(updatedSession.toolPolicy, policyUpdatedAt) ?? { mode: 'all' as const, toolIds: [], updatedAt: policyUpdatedAt };
                addSet('tool_policy', toolPolicy);
            }

            if ('enabled' in data) {
                addSet('enabled', updatedSession.enabled);
            }

            setClauses.push('updated_at = now()');

            const updatedRows = await this.sql.query(
                `UPDATE ${this.tableName}
                 SET ${setClauses.join(', ')}
                 WHERE user_id = $${paramIndex++} AND session_id = $${paramIndex++}
                 RETURNING id`,
                [...values, userId, sessionId]
            ) as Array<{ id: string }>;

            if (updatedRows.length === 0) {
                throw new Error(`Session ${sessionId} not found for userId ${userId}`);
            }
        }

    }

    async patchCredentials(userId: string, sessionId: string, data: Partial<SessionCredentials>): Promise<void> {
        if (!this.hasCredentialData(data)) return;
        const setClauses: string[] = [];
        const values: unknown[] = [];
        let paramIndex = 1;

        const addSet = (column: string, value: unknown) => {
            setClauses.push(`${column} = $${paramIndex++}`);
            values.push(value);
        };

        if ('clientInformation' in data) {
            addSet('client_information', data.clientInformation == null ? null : encryptObject(data.clientInformation));
        }
        if ('tokens' in data) {
            addSet('tokens', data.tokens == null ? null : encryptObject(data.tokens));
        }
        if ('discoveryState' in data) {
            addSet('discovery_state', data.discoveryState == null ? null : encryptObject(data.discoveryState));
        }
        if ('codeVerifier' in data) {
            addSet('code_verifier', data.codeVerifier == null ? null : encryptObject(data.codeVerifier));
        }
        if ('clientId' in data) {
            addSet('client_id', data.clientId ?? null);
        }
        if ('oauthState' in data) {
            addSet('oauth_state', data.oauthState ?? null);
        }

        setClauses.push('updated_at = now()');

        const updatedRows = await this.sql.query(
            `UPDATE ${this.tableName}
             SET ${setClauses.join(', ')}
             WHERE user_id = $${paramIndex++} AND session_id = $${paramIndex++}
             RETURNING id`,
            [...values, userId, sessionId]
        ) as Array<{ id: string }>;

        if (updatedRows.length === 0) {
            throw new Error(`Session ${sessionId} not found for userId ${userId}`);
        }
    }

    async get(userId: string, sessionId: string, options?: GetOptions): Promise<SessionResult | null> {
        try {
            const selection = options?.includeCredentials
                ? '*'
                : 'session_id, user_id, server_id, server_name, server_url, server_options, callback_url, created_at, updated_at, expires_at, headers, auth_url, status, tool_policy, enabled, server_options';

            const rows = await this.sql.query(
                `SELECT ${selection} FROM ${this.tableName} WHERE user_id = $1 AND session_id = $2`,
                [userId, sessionId]
            ) as NeonSessionRow[];

            if (!rows[0]) return null;
            return this.mapRowToSessionData(rows[0]);
        } catch (error) {
            console.error('[NeonStorage] Failed to get session:', error);
            return null;
        }
    }

    async getCredentials(userId: string, sessionId: string): Promise<SessionCredentials | null> {
        try {
            const rows = await this.sql.query(
                `SELECT client_information, tokens, discovery_state, code_verifier, client_id, oauth_state
                 FROM ${this.tableName} WHERE user_id = $1 AND session_id = $2`,
                [userId, sessionId]
            ) as NeonSessionRow[];

            if (!rows[0]) return null;
            const row = rows[0];
            return {
                sessionId,
                userId,
                clientInformation: decryptObject(row.client_information),
                tokens: decryptObject(row.tokens),
                discoveryState: decryptObject(row.discovery_state),
                codeVerifier: decryptObject(row.code_verifier),
                clientId: row.client_id ?? undefined,
                oauthState: row.oauth_state as SessionCredentials['oauthState'],
            };
        } catch (error) {
            console.error('[NeonStorage] Failed to get credentials:', error);
            return null;
        }
    }

    async list(userId: string): Promise<Session[]> {
        try {
            const rows = await this.sql.query(
                `SELECT * FROM ${this.tableName} WHERE user_id = $1`,
                [userId]
            ) as NeonSessionRow[];
            return rows.map((row) => this.mapRowToSessionData(row));
        } catch (error) {
            console.error(`[NeonStorage] Failed to get session data for ${userId}:`, error);
            return [];
        }
    }

    async clearCredentials(userId: string, sessionId: string): Promise<void> {
        try {
            await this.sql.query(
                `UPDATE ${this.tableName}
                 SET client_information = null, tokens = null, code_verifier = null, client_id = null, oauth_state = null, updated_at = now()
                 WHERE user_id = $1 AND session_id = $2`,
                [userId, sessionId]
            );
        } catch (error) {
            console.error('[NeonStorage] Failed to clear credentials:', error);
        }
    }

    async delete(userId: string, sessionId: string): Promise<void> {
        try {
            await this.sql.query(
                `DELETE FROM ${this.tableName} WHERE user_id = $1 AND session_id = $2`,
                [userId, sessionId]
            );
        } catch (error) {
            console.error('[NeonStorage] Failed to remove session:', error);
        }
    }

    async listIds(userId: string): Promise<string[]> {
        try {
            const rows = await this.sql.query(
                `SELECT session_id FROM ${this.tableName} WHERE user_id = $1`,
                [userId]
            ) as Array<{ session_id: string }>;
            return rows.map((row) => row.session_id);
        } catch (error) {
            console.error(`[NeonStorage] Failed to get sessions for ${userId}:`, error);
            return [];
        }
    }

    async listAllIds(): Promise<string[]> {
        try {
            const rows = await this.sql.query(
                `SELECT session_id FROM ${this.tableName}`
            ) as Array<{ session_id: string }>;
            return rows.map((row) => row.session_id);
        } catch (error) {
            console.error('[NeonStorage] Failed to get all sessions:', error);
            return [];
        }
    }

    async clearAll(): Promise<void> {
        try {
            await this.sql.query(`DELETE FROM ${this.tableName}`);
        } catch (error) {
            console.error('[NeonStorage] Failed to clear sessions:', error);
        }
    }

    async cleanupExpired(): Promise<void> {
        try {
            await this.sql.query(
                `DELETE FROM ${this.tableName}
                 WHERE expires_at IS NOT NULL
                   AND expires_at < $1
                   AND status <> 'active'`,
                [new Date().toISOString()]
            );
            await this.sql.query(
                `DELETE FROM ${this.tableName}
                 WHERE status = 'active' AND updated_at < $1`,
                [new Date(Date.now() - DORMANT_SESSION_EXPIRATION_MS).toISOString()]
            );
        } catch (error) {
            console.error('[NeonStorage] Failed to cleanup expired sessions:', error);
        }
    }

    async disconnect(): Promise<void> {
        // Neon HTTP queries do not hold a persistent connection.
    }
}
