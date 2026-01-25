
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

    constructor() { }

    private getSessionKey(identity: string, sessionId: string): string {
        return `${identity}:${sessionId}`;
    }

    generateSessionId(): string {
        return firstChar() + rest();
    }

    async setClient(options: SetClientOptions): Promise<void> {
        const {
            sessionId,
            serverId,
            serverName,
            serverUrl,
            callbackUrl,
            transportType = 'streamable_http',
            identity,
            headers,
            active = false
        } = options;

        if (!serverUrl || !callbackUrl) {
            throw new Error('serverUrl and callbackUrl required');
        }

        if (!identity || !sessionId) {
            throw new Error('identity and sessionId required');
        }

        const sessionKey = this.getSessionKey(identity, sessionId);
        const existingData = this.sessions.get(sessionKey) || {};

        const sessionData: SessionData = {
            // Initialize with existing data if present
            ...((existingData as unknown) as SessionData),
            sessionId,
            serverId,
            serverName,
            serverUrl,
            callbackUrl,
            transportType,
            createdAt: (existingData as SessionData).createdAt || Date.now(),
            active,
            identity,
            headers,
        };

        this.sessions.set(sessionKey, sessionData);

        // Update index
        if (!this.identitySessions.has(identity)) {
            this.identitySessions.set(identity, new Set());
        }
        this.identitySessions.get(identity)!.add(sessionId);
    }

    async updateSession(identity: string, sessionId: string, data: Partial<SessionData>): Promise<void> {
        if (!identity || !sessionId) throw new Error('identity and sessionId required');

        const sessionKey = this.getSessionKey(identity, sessionId);
        const existingData = this.sessions.get(sessionKey);

        if (!existingData) {
            const sessionData: SessionData = {
                sessionId,
                identity,
                createdAt: Date.now(),
                active: false,
                ...data
            } as SessionData;
            this.sessions.set(sessionKey, sessionData);

            if (!this.identitySessions.has(identity)) {
                this.identitySessions.set(identity, new Set());
            }
            this.identitySessions.get(identity)!.add(sessionId);
            return;
        }

        const sessionData: SessionData = {
            ...existingData,
            ...data
        };

        this.sessions.set(sessionKey, sessionData);
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
}
