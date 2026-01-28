
import { customAlphabet } from 'nanoid';
import { StorageBackend, SessionData, SetClientOptions } from './types';

// first char: letters only (required by OpenAI)
const firstChar = customAlphabet(
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
    1
);

// remaining chars: alphanumeric
const rest = customAlphabet(
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
    11
);

/**
 * In-memory implementation of StorageBackend
 * Useful for local development or testing
 */
export class MemoryStorageBackend implements StorageBackend {
    // Map<identity:sessionId, SessionData>
    private sessions = new Map<string, SessionData>();

    // Map<identity, Set<sessionId>>
    private identitySessions = new Map<string, Set<string>>();

    // Generic key-value storage (for OAuth data following Cloudflare pattern)
    private kvStore = new Map<string, unknown>();

    constructor() { }

    private getSessionKey(identity: string, sessionId: string): string {
        return `${identity}:${sessionId}`;
    }

    generateSessionId(): string {
        return firstChar() + rest();
    }

    async createSession(session: SessionData, ttl?: number): Promise<void> {
        const { sessionId, identity } = session;
        if (!sessionId || !identity) throw new Error('identity and sessionId required');

        const sessionKey = this.getSessionKey(identity, sessionId);
        if (this.sessions.has(sessionKey)) {
            throw new Error(`Session ${sessionId} already exists`);
        }

        this.sessions.set(sessionKey, session);

        // Update index
        if (!this.identitySessions.has(identity)) {
            this.identitySessions.set(identity, new Set());
        }
        this.identitySessions.get(identity)!.add(sessionId);
        // Note: TTL is ignored in memory backend - sessions don't auto-expire
    }

    async updateSession(identity: string, sessionId: string, data: Partial<SessionData>, ttl?: number): Promise<void> {
        if (!identity || !sessionId) throw new Error('identity and sessionId required');

        const sessionKey = this.getSessionKey(identity, sessionId);
        const current = this.sessions.get(sessionKey);

        if (!current) {
            throw new Error(`Session ${sessionId} not found`);
        }

        const updated = {
            ...current,
            ...data
        };

        this.sessions.set(sessionKey, updated);
        // Note: TTL is ignored in memory backend - sessions don't auto-expire
    }


    async getSession(identity: string, sessionId: string): Promise<SessionData | null> {
        const sessionKey = this.getSessionKey(identity, sessionId);
        return this.sessions.get(sessionKey) || null;
    }

    async getIdentityMcpSessions(identity: string): Promise<string[]> {
        const set = this.identitySessions.get(identity);
        return set ? Array.from(set) : [];
    }

    async getIdentitySessionsData(identity: string): Promise<SessionData[]> {
        const set = this.identitySessions.get(identity);
        if (!set) return [];

        const results: SessionData[] = [];
        for (const sessionId of set) {
            const session = this.sessions.get(this.getSessionKey(identity, sessionId));
            if (session) {
                results.push(session);
            }
        }
        return results;
    }

    async removeSession(identity: string, sessionId: string): Promise<void> {
        const sessionKey = this.getSessionKey(identity, sessionId);
        this.sessions.delete(sessionKey);

        const set = this.identitySessions.get(identity);
        if (set) {
            set.delete(sessionId);
            if (set.size === 0) {
                this.identitySessions.delete(identity);
            }
        }
    }

    async getAllSessionIds(): Promise<string[]> {
        return Array.from(this.sessions.values()).map(s => s.sessionId);
    }

    async clearAll(): Promise<void> {
        this.sessions.clear();
        this.identitySessions.clear();
    }

    async cleanupExpiredSessions(): Promise<void> {
        // In-memory doesn't implement TTL automatically, 
        // but we could check createdAt + TTL here if needed.
        // For now, no-op.
    }

    async disconnect(): Promise<void> {
        // No-op for memory
    }

    // ============================================
    // Key-Value Storage (for OAuth data)
    // ============================================

    async get<T>(key: string): Promise<T | undefined> {
        return this.kvStore.get(key) as T | undefined;
    }

    async set<T>(key: string, value: T, ttl?: number): Promise<void> {
        this.kvStore.set(key, value);
        // Note: TTL is ignored in memory backend
    }

    async delete(key: string): Promise<void> {
        this.kvStore.delete(key);
    }

    async deleteMany(keys: string[]): Promise<void> {
        for (const key of keys) {
            this.kvStore.delete(key);
        }
    }
}
