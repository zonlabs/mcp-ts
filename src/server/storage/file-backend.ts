
import { promises as fs } from 'fs';
import * as path from 'path';
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
 * File system implementation of StorageBackend
 * Persists sessions to a JSON file
 */
export class FileStorageBackend implements StorageBackend {
    private filePath: string;
    private memoryCache: Map<string, SessionData> | null = null;
    private initialized = false;

    /**
     * @param options.path Path to the JSON file storage (default: ./sessions.json)
     */
    constructor(options: { path?: string } = {}) {
        this.filePath = options.path || './sessions.json';
    }

    /**
     * Initialize storage: ensure file exists and load into memory cache
     */
    async init(): Promise<void> {
        if (this.initialized) return;

        try {
            // Ensure directory exists
            const dir = path.dirname(this.filePath);
            await fs.mkdir(dir, { recursive: true });

            // Try to read file
            const data = await fs.readFile(this.filePath, 'utf-8');
            const json = JSON.parse(data);

            this.memoryCache = new Map();
            if (Array.isArray(json)) {
                json.forEach((s: SessionData) => {
                    this.memoryCache!.set(this.getSessionKey(s.identity || 'unknown', s.sessionId), s);
                });
            }
        } catch (error: any) {
            if (error.code === 'ENOENT') {
                // File does not exist, initialize empty
                this.memoryCache = new Map();
                await this.flush();
            } else {
                console.error('[FileStorage] Failed to load sessions:', error);
                throw error;
            }
        }

        this.initialized = true;
    }

    private async ensureInitialized() {
        if (!this.initialized) await this.init();
    }

    private async flush(): Promise<void> {
        if (!this.memoryCache) return;
        const sessions = Array.from(this.memoryCache.values());
        await fs.writeFile(this.filePath, JSON.stringify(sessions, null, 2), 'utf-8');
    }

    private getSessionKey(identity: string, sessionId: string): string {
        return `${identity}:${sessionId}`;
    }

    generateSessionId(): string {
        return firstChar() + rest();
    }

    async createSession(session: SessionData, ttl?: number): Promise<void> {
        await this.ensureInitialized();
        const { sessionId, identity } = session;
        if (!sessionId || !identity) throw new Error('identity and sessionId required');

        const sessionKey = this.getSessionKey(identity, sessionId);
        if (this.memoryCache!.has(sessionKey)) {
            throw new Error(`Session ${sessionId} already exists`);
        }

        this.memoryCache!.set(sessionKey, session);
        await this.flush();
        // Note: TTL is ignored in file backend - sessions don't auto-expire
    }

    async updateSession(identity: string, sessionId: string, data: Partial<SessionData>, ttl?: number): Promise<void> {
        await this.ensureInitialized();
        if (!identity || !sessionId) throw new Error('identity and sessionId required');

        const sessionKey = this.getSessionKey(identity, sessionId);
        const current = this.memoryCache!.get(sessionKey);

        if (!current) {
            throw new Error(`Session ${sessionId} not found`);
        }

        const updated = {
            ...current,
            ...data
        };

        this.memoryCache!.set(sessionKey, updated);
        await this.flush();
        // Note: TTL is ignored in file backend - sessions don't auto-expire
    }

    async getSession(identity: string, sessionId: string): Promise<SessionData | null> {
        await this.ensureInitialized();
        const sessionKey = this.getSessionKey(identity, sessionId);
        return this.memoryCache!.get(sessionKey) || null;
    }

    async getIdentitySessionsData(identity: string): Promise<SessionData[]> {
        await this.ensureInitialized();
        return Array.from(this.memoryCache!.values()).filter(s => s.identity === identity);
    }

    async getIdentityMcpSessions(identity: string): Promise<string[]> {
        await this.ensureInitialized();
        return Array.from(this.memoryCache!.values())
            .filter(s => s.identity === identity)
            .map(s => s.sessionId);
    }

    async removeSession(identity: string, sessionId: string): Promise<void> {
        await this.ensureInitialized();
        const sessionKey = this.getSessionKey(identity, sessionId);
        if (this.memoryCache!.delete(sessionKey)) {
            await this.flush();
        }
    }

    async getAllSessionIds(): Promise<string[]> {
        await this.ensureInitialized();
        return Array.from(this.memoryCache!.values()).map(s => s.sessionId);
    }

    async clearAll(): Promise<void> {
        await this.ensureInitialized();
        this.memoryCache!.clear();
        await this.flush();
    }

    async cleanupExpiredSessions(): Promise<void> {
        // Could implement TTL check here using createdAt
        await this.ensureInitialized();
    }

    async disconnect(): Promise<void> {
        // No explicit disconnect needed for file
    }
}
