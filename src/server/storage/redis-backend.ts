
import type { Redis } from 'ioredis';
import { customAlphabet } from 'nanoid';
import { StorageBackend, SessionData, SetClientOptions } from './types';
import { SESSION_TTL_SECONDS } from '../../shared/constants.js';

/** first char: letters only (required by OpenAI) */
const firstChar = customAlphabet(
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
    1
);

/** remaining chars: alphanumeric */
const rest = customAlphabet(
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
    11
);

/**
 * Redis implementation of StorageBackend
 */
export class RedisStorageBackend implements StorageBackend {
    private readonly DEFAULT_TTL = SESSION_TTL_SECONDS;
    private readonly KEY_PREFIX = 'mcp:session:';

    constructor(private redis: Redis) { }

    /**
     * Generates Redis key for a specific session
     * @private
     */
    private getSessionKey(identity: string, sessionId: string): string {
        return `${this.KEY_PREFIX}${identity}:${sessionId}`;
    }

    /**
     * Generates Redis key for tracking all sessions for an identity
     * @private
     */
    private getIdentityKey(identity: string): string {
        return `mcp:identity:${identity}:sessions`;
    }

    generateSessionId(): string {
        return firstChar() + rest();
    }

    async createSession(session: SessionData, ttl?: number): Promise<void> {
        const { sessionId, identity } = session;
        if (!sessionId || !identity) throw new Error('identity and sessionId required');

        const sessionKey = this.getSessionKey(identity, sessionId);
        const identityKey = this.getIdentityKey(identity);
        const effectiveTtl = ttl ?? this.DEFAULT_TTL;

        /** ioredis syntax: set(key, val, 'EX', ttl, 'NX') */
        const result = await this.redis.set(
            sessionKey,
            JSON.stringify(session),
            'EX',
            effectiveTtl,
            'NX'
        );

        if (result !== 'OK') {
            throw new Error(`Session ${sessionId} already exists`);
        }

        await this.redis.sadd(identityKey, sessionId);
    }
    async updateSession(identity: string, sessionId: string, data: Partial<SessionData>, ttl?: number): Promise<void> {
        const sessionKey = this.getSessionKey(identity, sessionId);
        const effectiveTtl = ttl ?? this.DEFAULT_TTL;

        /** Lua script for atomic parsing, merging, and saving */
        const script = `
            local currentStr = redis.call("GET", KEYS[1])
            if not currentStr then
                return 0
            end

            local current = cjson.decode(currentStr)
            local updates = cjson.decode(ARGV[1])

            for k,v in pairs(updates) do
                current[k] = v
            end

            redis.call("SET", KEYS[1], cjson.encode(current), "EX", ARGV[2])
            return 1
        `;

        const result = await this.redis.eval(
            script,
            1,
            sessionKey,
            JSON.stringify(data),
            effectiveTtl
        );

        if (result === 0) {
            throw new Error(`Session ${sessionId} not found for identity ${identity}`);
        }
    }

    async getSession(identity: string, sessionId: string): Promise<SessionData | null> {
        try {
            const sessionKey = this.getSessionKey(identity, sessionId);
            const sessionDataStr = await this.redis.get(sessionKey);

            if (!sessionDataStr) {
                return null;
            }

            const sessionData: SessionData = JSON.parse(sessionDataStr);
            return sessionData;
        } catch (error) {
            console.error('[RedisStorage] Failed to get session:', error);
            return null;
        }
    }

    async getIdentityMcpSessions(identity: string): Promise<string[]> {
        const identityKey = this.getIdentityKey(identity);
        try {
            return await this.redis.smembers(identityKey);
        } catch (error) {
            console.error(`[RedisStorage] Failed to get sessions for ${identity}:`, error);
            return [];
        }
    }

    async getIdentitySessionsData(identity: string): Promise<SessionData[]> {
        try {
            const sessionIds = await this.redis.smembers(this.getIdentityKey(identity));
            if (sessionIds.length === 0) return [];

            const results = await Promise.all(
                sessionIds.map(async (sessionId) => {
                    const data = await this.redis.get(this.getSessionKey(identity, sessionId));
                    return data ? (JSON.parse(data) as SessionData) : null;
                })
            );

            return results.filter((session): session is SessionData => session !== null);
        } catch (error) {
            console.error(`[RedisStorage] Failed to get session data for ${identity}:`, error);
            return [];
        }
    }

    async removeSession(identity: string, sessionId: string): Promise<void> {
        try {
            const sessionKey = this.getSessionKey(identity, sessionId);
            const identityKey = this.getIdentityKey(identity);

            await this.redis.srem(identityKey, sessionId);
            await this.redis.del(sessionKey);
        } catch (error) {
            console.error('[RedisStorage] Failed to remove session:', error);
        }
    }

    async getAllSessionIds(): Promise<string[]> {
        try {
            const pattern = `${this.KEY_PREFIX}*`;
            const keys = await this.redis.keys(pattern);
            return keys.map((key) => key.replace(this.KEY_PREFIX, ''));
        } catch (error) {
            console.error('[RedisStorage] Failed to get all sessions:', error);
            return [];
        }
    }

    async clearAll(): Promise<void> {
        try {
            const pattern = `${this.KEY_PREFIX}*`;
            const keys = await this.redis.keys(pattern);
            if (keys.length > 0) {
                await this.redis.del(...keys);
            }
        } catch (error) {
            console.error('[RedisStorage] Failed to clear sessions:', error);
        }
    }

    async cleanupExpiredSessions(): Promise<void> {
        try {
            const pattern = `${this.KEY_PREFIX}*`;
            const keys = await this.redis.keys(pattern);

            for (const key of keys) {
                const ttl = await this.redis.ttl(key);
                if (ttl <= 0) {
                    await this.redis.del(key);
                }
            }
        } catch (error) {
            console.error('[RedisStorage] Failed to cleanup expired sessions:', error);
        }
    }

    async disconnect(): Promise<void> {
        try {
            await this.redis.quit();
        } catch (error) {
            console.error('[RedisStorage] Failed to disconnect:', error);
        }
    }

    // ============================================
    // Key-Value Storage (for OAuth data)
    // ============================================

    private readonly KV_PREFIX = 'mcp:kv:';

    async get<T>(key: string): Promise<T | undefined> {
        try {
            const value = await this.redis.get(`${this.KV_PREFIX}${key}`);
            return value ? JSON.parse(value) as T : undefined;
        } catch (error) {
            console.error('[RedisStorage] Failed to get key:', error);
            return undefined;
        }
    }

    async set<T>(key: string, value: T, ttl?: number): Promise<void> {
        try {
            const fullKey = `${this.KV_PREFIX}${key}`;
            if (ttl) {
                await this.redis.set(fullKey, JSON.stringify(value), 'EX', ttl);
            } else {
                await this.redis.set(fullKey, JSON.stringify(value));
            }
        } catch (error) {
            console.error('[RedisStorage] Failed to set key:', error);
        }
    }

    async delete(key: string): Promise<void> {
        try {
            await this.redis.del(`${this.KV_PREFIX}${key}`);
        } catch (error) {
            console.error('[RedisStorage] Failed to delete key:', error);
        }
    }

    async deleteMany(keys: string[]): Promise<void> {
        if (keys.length === 0) return;
        try {
            const fullKeys = keys.map(k => `${this.KV_PREFIX}${k}`);
            await this.redis.del(...fullKeys);
        } catch (error) {
            console.error('[RedisStorage] Failed to delete keys:', error);
        }
    }
}
