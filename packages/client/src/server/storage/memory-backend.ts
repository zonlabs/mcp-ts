import type { SessionStore, Session, SessionCredentials, GetOptions, SessionResult } from './types.js';
import { generateSessionId } from '../../shared/utils.js';
import { isSessionExpired, mergeSessionUpdate, normalizeNewSession } from './session-lifecycle.js';

/**
 * In-memory implementation of SessionStore
 * Useful for local development or testing
 */
export class MemoryStorageBackend implements SessionStore {
    // Map<userId:sessionId, Session>
    private sessions = new Map<string, Session>();

    // Map<userId, Set<sessionId>>
    private userIdSessions = new Map<string, Set<string>>();

    constructor() { }

    async init(): Promise<void> {
    }

    private getSessionKey(userId: string, sessionId: string): string {
        return `${userId}:${sessionId}`;
    }

    generateSessionId(): string {
        return generateSessionId();
    }

    async create(session: Session): Promise<void> {
        const { sessionId, userId } = session;
        if (!sessionId || !userId) throw new Error('userId and sessionId required');

        const sessionKey = this.getSessionKey(userId, sessionId);
        if (this.sessions.has(sessionKey)) {
            throw new Error(`Session ${sessionId} already exists`);
        }

        this.sessions.set(sessionKey, normalizeNewSession(session));

        // Update index
        if (!this.userIdSessions.has(userId)) {
            this.userIdSessions.set(userId, new Set());
        }
        this.userIdSessions.get(userId)!.add(sessionId);
    }

    async update(userId: string, sessionId: string, data: Partial<Session>): Promise<void> {
        if (!userId || !sessionId) throw new Error('userId and sessionId required');

        const sessionKey = this.getSessionKey(userId, sessionId);
        const current = this.sessions.get(sessionKey);

        if (!current) {
            throw new Error(`Session ${sessionId} not found`);
        }

        const updated = mergeSessionUpdate(current, data);

        this.sessions.set(sessionKey, updated);
    }

    async patchCredentials(userId: string, sessionId: string, data: Partial<SessionCredentials>): Promise<void> {
        const sessionKey = this.getSessionKey(userId, sessionId);
        const current = this.sessions.get(sessionKey);
        if (!current) {
            throw new Error(`Session ${sessionId} not found`);
        }

        this.sessions.set(sessionKey, { ...current, ...data, sessionId, userId });
    }


    async get(userId: string, sessionId: string, options?: GetOptions): Promise<SessionResult | null> {
        const sessionKey = this.getSessionKey(userId, sessionId);
        const session = this.sessions.get(sessionKey) || null;
        if (!session) return session;
        if (!options?.includeCredentials) {
            const { clientInformation, tokens, discoveryState, codeVerifier, codeVerifierChallenge, codeVerifierNonce, clientId, oauthState, ...sessionOnly } = session;
            return sessionOnly as Session;
        }
        return session;
    }

    async getCredentials(userId: string, sessionId: string): Promise<SessionCredentials | null> {
        const sessionKey = this.getSessionKey(userId, sessionId);
        const session = this.sessions.get(sessionKey);
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

    async listIds(userId: string): Promise<string[]> {
        const set = this.userIdSessions.get(userId);
        return set ? Array.from(set) : [];
    }

    async list(userId: string): Promise<Session[]> {
        const set = this.userIdSessions.get(userId);
        if (!set) return [];

        const results: Session[] = [];
        for (const sessionId of set) {
            const session = this.sessions.get(this.getSessionKey(userId, sessionId));
            if (session) {
                results.push(session);
            }
        }
        return results;
    }

    async delete(userId: string, sessionId: string): Promise<void> {
        const sessionKey = this.getSessionKey(userId, sessionId);
        this.sessions.delete(sessionKey);

        const set = this.userIdSessions.get(userId);
        if (set) {
            set.delete(sessionId);
            if (set.size === 0) {
                this.userIdSessions.delete(userId);
            }
        }
    }

    async listAllIds(): Promise<string[]> {
        return Array.from(this.sessions.values()).map(s => s.sessionId);
    }

    async clearAll(): Promise<void> {
        this.sessions.clear();
        this.userIdSessions.clear();
    }

    async cleanupExpired(): Promise<void> {
        for (const [key, session] of this.sessions.entries()) {
            if (!isSessionExpired(session)) continue;

            this.sessions.delete(key);

            const set = this.userIdSessions.get(session.userId);
            if (set) {
                set.delete(session.sessionId);
                if (set.size === 0) {
                    this.userIdSessions.delete(session.userId);
                }
            }
        }
    }

    async disconnect(): Promise<void> {
        // No-op for memory
    }
}
