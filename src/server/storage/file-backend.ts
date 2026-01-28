
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
    private kvCache: Map<string, unknown> | null = null; // Key-value store for OAuth data
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
            this.kvCache = new Map();

            // Handle both old format (array) and new format (object with sessions + kv)
            if (Array.isArray(json)) {
                // Old format: array of sessions
                json.forEach((s: SessionData) => {
                    this.memoryCache!.set(this.getSessionKey(s.identity || 'unknown', s.sessionId), s);
                });
            } else if (json && typeof json === 'object') {
                // New format: { sessions: [...], kv: {...} }
                if (Array.isArray(json.sessions)) {
                    json.sessions.forEach((s: SessionData) => {
                        this.memoryCache!.set(this.getSessionKey(s.identity || 'unknown', s.sessionId), s);
                    });
                }
                if (json.kv && typeof json.kv === 'object') {
                    Object.entries(json.kv).forEach(([key, value]) => {
                        this.kvCache!.set(key, value);
                    });
                }
            }
        } catch (error: any) {
            if (error.code === 'ENOENT') {
                // File does not exist, initialize empty
                this.memoryCache = new Map();
                this.kvCache = new Map();
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
        const kv = this.kvCache ? Object.fromEntries(this.kvCache) : {};
        await fs.writeFile(this.filePath, JSON.stringify({ sessions, kv }, null, 2), 'utf-8');
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

    // ============================================
    // Key-Value Storage (for OAuth data)
    // ============================================

    async get<T>(key: string): Promise<T | undefined> {
        await this.ensureInitialized();
        return this.kvCache!.get(key) as T | undefined;
    }

    async set<T>(key: string, value: T, ttl?: number): Promise<void> {
        await this.ensureInitialized();
        this.kvCache!.set(key, value);
        await this.flush();
        // Note: TTL is ignored in file backend
    }

    async delete(key: string): Promise<void> {
        await this.ensureInitialized();
        if (this.kvCache!.delete(key)) {
            await this.flush();
        }
    }

    async deleteMany(keys: string[]): Promise<void> {
        await this.ensureInitialized();
        let changed = false;
        for (const key of keys) {
            if (this.kvCache!.delete(key)) {
                changed = true;
            }
        }
        if (changed) {
            await this.flush();
        }
    }
}
