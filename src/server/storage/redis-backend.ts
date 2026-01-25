
import { Redis } from 'ioredis';
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
 * Redis implementation of StorageBackend
 */
export class RedisStorageBackend implements StorageBackend {
    private readonly SESSION_TTL = 43200;
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

        try {
            const sessionKey = this.getSessionKey(identity, sessionId);
            const existingDataStr = await this.redis.get(sessionKey);
            const existingData = existingDataStr ? JSON.parse(existingDataStr) : {};

            const sessionData: SessionData = {
                ...existingData,
                sessionId,
                serverId,
                serverName,
                serverUrl,
                callbackUrl,
                transportType,
                createdAt: existingData.createdAt || Date.now(),
                active,
                identity,
                headers,
            };

            await this.redis.setex(sessionKey, this.SESSION_TTL, JSON.stringify(sessionData));

            const identityKey = this.getIdentityKey(identity);
            await this.redis.sadd(identityKey, sessionId);
        } catch (error) {
            console.error('[RedisStorage] Failed to store session:', error);
            throw error;
        }
    }

    async updateSession(identity: string, sessionId: string, data: Partial<SessionData>): Promise<void> {
        if (!identity || !sessionId) {
            throw new Error('identity and sessionId required');
        }

        try {
            const sessionKey = this.getSessionKey(identity, sessionId);
            const existingDataStr = await this.redis.get(sessionKey);

            if (!existingDataStr) {
                // Optimization: if trying to update non-existent session, maybe create it if data has minimal fields?
                // But for now, let's assume we are updating existing, or we treat it as create new if enough data?
                // Let's just create raw object if missing.
                const sessionData: SessionData = {
                    sessionId,
                    identity,
                    createdAt: Date.now(),
                    active: false,
                    // These fields should be in data if it's a new session, otherwise they might lack required
                    // But StorageOAuthClientProvider ensures base data is present if creating new.
                    ...data
                } as SessionData;
                // Note: unsafe cast but assumes caller knows what they are doing if session is new.

                await this.redis.setex(sessionKey, this.SESSION_TTL, JSON.stringify(sessionData));
                // Also add to identity key
                const identityKey = this.getIdentityKey(identity);
                await this.redis.sadd(identityKey, sessionId);
                return;
            }

            const existingData = JSON.parse(existingDataStr);
            const sessionData: SessionData = {
                ...existingData,
                ...data
            };

            await this.redis.setex(sessionKey, this.SESSION_TTL, JSON.stringify(sessionData));
            // Refresh TTL by re-setting
        } catch (error) {
            console.error('[RedisStorage] Failed to update session:', error);
            throw error;
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
            await this.redis.expire(sessionKey, this.SESSION_TTL);
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
}
