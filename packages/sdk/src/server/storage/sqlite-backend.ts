import type { Database } from 'better-sqlite3';
import type { SessionStore, Session, SessionCredentials, GetOptions, SessionResult } from './types.js';
import * as fs from 'fs';
import * as path from 'path';
import { generateSessionId } from '../../shared/utils.js';
import {
    mergeSessionUpdate,
    normalizeNewSession,
    normalizeStoredSession,
    isSessionExpired,
} from './session-lifecycle.js';

export interface SqliteStorageOptions {
    path?: string;
    table?: string;
}

export class SqliteStorage implements SessionStore {
    private db: Database | null = null;
    private table: string;
    private initialized = false;
    private dbPath: string;

    constructor(options: SqliteStorageOptions = {}) {
        this.dbPath = options.path || './sessions.db';
        this.table = options.table || 'mcp_sessions';
    }

    async init(): Promise<void> {
        if (this.initialized) return;

        try {
            // Dynamic import for peer dependency
            const DatabaseConstructor = (await import('better-sqlite3')).default;

            // Ensure directory exists
            const dir = path.dirname(this.dbPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            this.db = new DatabaseConstructor(this.dbPath);
            this.db.pragma('foreign_keys = ON');
            this.db.exec(`
                CREATE TABLE IF NOT EXISTS ${this.table} (
                    sessionId TEXT PRIMARY KEY,
                    userId TEXT NOT NULL,
                    data TEXT NOT NULL,
                    expiresAt INTEGER
                );
                CREATE INDEX IF NOT EXISTS idx_${this.table}_userId ON ${this.table}(userId);
            `);

            this.initialized = true;
            console.log(`[mcp-ts][Storage] SQLite: ✓ database at ${this.dbPath} verified.`);
        } catch (error: any) {
            if (error.code === 'MODULE_NOT_FOUND' || error.message?.includes('better-sqlite3')) {
                throw new Error(
                    'better-sqlite3 is not installed. Please install it with: npm install better-sqlite3'
                );
            }
            throw error;
        }
    }

    private ensureInitialized() {
        if (!this.initialized) {
            throw new Error('SqliteStorage not initialized. Call init() first.');
        }
    }

    generateSessionId(): string {
        return generateSessionId();
    }

    async create(session: Session): Promise<void> {
        this.ensureInitialized();
        const { sessionId, userId } = session;

        if (!sessionId || !userId) {
            throw new Error('userId and sessionId required');
        }

        const sessionWithLifecycle = normalizeNewSession(session);

        try {
            const stmt = this.db!.prepare(
                `INSERT INTO ${this.table} (sessionId, userId, data, expiresAt) VALUES (?, ?, ?, ?)`
            );
            stmt.run(sessionId, userId, JSON.stringify(sessionWithLifecycle), sessionWithLifecycle.expiresAt ?? null);
        } catch (error: any) {
            if (error.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
                throw new Error(`Session ${sessionId} already exists`);
            }
            throw error;
        }
    }

    async update(userId: string, sessionId: string, data: Partial<Session>): Promise<void> {
        this.ensureInitialized();
        if (!sessionId || !userId) {
            throw new Error('userId and sessionId required');
        }

        const currentSession = await this.get(userId, sessionId);
        if (!currentSession) {
            throw new Error(`Session ${sessionId} not found for userId ${userId}`);
        }

        const updatedSession = mergeSessionUpdate(currentSession, data);

        const stmt = this.db!.prepare(
            `UPDATE ${this.table} SET data = ?, expiresAt = ? WHERE sessionId = ? AND userId = ?`
        );

        stmt.run(JSON.stringify(updatedSession), updatedSession.expiresAt ?? null, sessionId, userId);
    }

    async patchCredentials(userId: string, sessionId: string, data: Partial<SessionCredentials>): Promise<void> {
        this.ensureInitialized();
        const currentSession = await this.get(userId, sessionId, { includeCredentials: true });
        if (!currentSession) {
            throw new Error(`Session ${sessionId} not found for userId ${userId}`);
        }

        const updated = { ...currentSession, ...data, sessionId, userId };
        const stmt = this.db!.prepare(
            `UPDATE ${this.table} SET data = ? WHERE sessionId = ? AND userId = ?`
        );
        stmt.run(JSON.stringify(updated), sessionId, userId);
    }

    async get(userId: string, sessionId: string, options?: GetOptions): Promise<SessionResult | null> {
        this.ensureInitialized();

        const stmt = this.db!.prepare(
            `SELECT data FROM ${this.table} WHERE sessionId = ? AND userId = ?`
        );
        const row = stmt.get(sessionId, userId) as { data: string } | undefined;

        if (!row) return null;

        const session = normalizeStoredSession(JSON.parse(row.data) as Session);
        if (!options?.includeCredentials) {
            const { clientInformation, tokens, discoveryState, codeVerifier, codeVerifierChallenge, codeVerifierNonce, clientId, oauthState, ...sessionOnly } = session;
            return sessionOnly as Session;
        }
        return session;
    }

    async getCredentials(userId: string, sessionId: string): Promise<SessionCredentials | null> {
        this.ensureInitialized();
        const session = await this.get(userId, sessionId, { includeCredentials: true });
        if (!session) return null;

        const { clientInformation, tokens, discoveryState, codeVerifier, codeVerifierChallenge, codeVerifierNonce, clientId, oauthState } = session;
        return {
            sessionId, userId,
            clientInformation, tokens, discoveryState, codeVerifier,
            codeVerifierChallenge, codeVerifierNonce,
            clientId, oauthState,
        };
    }

    async clearCredentials(userId: string, sessionId: string): Promise<void> {
        await this.patchCredentials(userId, sessionId, {
            clientInformation: null,
            tokens: null,
            discoveryState: null,
            codeVerifier: null,
            codeVerifierChallenge: null,
            codeVerifierNonce: null,
            clientId: null,
            oauthState: null,
        });
    }

    async list(userId: string): Promise<Session[]> {
        this.ensureInitialized();

        const stmt = this.db!.prepare(
            `SELECT data FROM ${this.table} WHERE userId = ?`
        );
        const rows = stmt.all(userId) as { data: string }[];

        return rows.map(row => normalizeStoredSession(JSON.parse(row.data) as Session));
    }

    async listIds(userId: string): Promise<string[]> {
        this.ensureInitialized();

        const stmt = this.db!.prepare(
            `SELECT sessionId FROM ${this.table} WHERE userId = ?`
        );
        const rows = stmt.all(userId) as { sessionId: string }[];

        return rows.map(row => row.sessionId);
    }

    async delete(userId: string, sessionId: string): Promise<void> {
        this.ensureInitialized();
        const stmt = this.db!.prepare(
            `DELETE FROM ${this.table} WHERE sessionId = ? AND userId = ?`
        );
        stmt.run(sessionId, userId);
    }

    async listAllIds(): Promise<string[]> {
        this.ensureInitialized();
        const stmt = this.db!.prepare(`SELECT sessionId FROM ${this.table}`);
        const rows = stmt.all() as { sessionId: string }[];
        return rows.map(row => row.sessionId);
    }

    async clearAll(): Promise<void> {
        this.ensureInitialized();
        const stmt = this.db!.prepare(`DELETE FROM ${this.table}`);
        stmt.run();
    }

    async cleanupExpired(): Promise<void> {
        this.ensureInitialized();
        const rows = this.db!.prepare(`SELECT sessionId, userId, data FROM ${this.table}`).all() as {
            sessionId: string;
            userId: string;
            data: string;
        }[];
        const deleteStmt = this.db!.prepare(`DELETE FROM ${this.table} WHERE sessionId = ? AND userId = ?`);

        for (const row of rows) {
            const session = normalizeStoredSession(JSON.parse(row.data) as Session);
            if (isSessionExpired(session)) {
                deleteStmt.run(row.sessionId, row.userId);
            }
        }
    }

    async disconnect(): Promise<void> {
        if (this.db) {
            this.db.close();
        }
    }
}
