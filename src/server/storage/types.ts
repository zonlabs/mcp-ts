
import type { MCPClient } from '../mcp/oauth-client.js';
import type {
    OAuthTokens,
    OAuthClientInformationMixed,
} from '@modelcontextprotocol/sdk/shared/auth.js';

export interface SessionData {
    sessionId: string;
    serverId?: string; // Database server ID for mapping
    serverName?: string;
    serverUrl: string;
    transportType: 'sse' | 'streamable_http';
    callbackUrl: string;
    createdAt: number;
    identity?: string;
    headers?: Record<string, string>;
    // Note: OAuth data (tokens, codeVerifier, clientInformation) is stored separately
    // using key-value storage methods, following Cloudflare's agents pattern
}

export interface SetClientOptions {
    sessionId: string;
    serverId?: string; // Database server ID
    serverName?: string; // Human-readable server name
    client?: MCPClient;
    serverUrl?: string;
    callbackUrl?: string;
    transportType?: 'sse' | 'streamable_http';
    identity?: string;
    headers?: Record<string, string>;
}

/**
 * Interface for MCP Session Storage Backends
 */
export interface StorageBackend {
    /**
     * Optional initialization (e.g., database connection)
     */
    init?(): Promise<void>;

    /**
     * Generates a unique session ID
     */
    generateSessionId(): string;

    /**
     * Stores or updates a session
     */
    /**
     * Creates a new session. Throws if session already exists.
     * @param session - Session data to create
     * @param ttl - Optional TTL in seconds (defaults to backend's default)
     */
    createSession(session: SessionData, ttl?: number): Promise<void>;

    /**
     * Updates an existing session with partial data. Throws if session does not exist.
     * @param identity - User identity
     * @param sessionId - Session identifier
     * @param data - Partial session data to update
     * @param ttl - Optional TTL in seconds (defaults to backend's default)
     */
    updateSession(identity: string, sessionId: string, data: Partial<SessionData>, ttl?: number): Promise<void>;

    /**
     * Retrieves a session
     */
    getSession(identity: string, sessionId: string): Promise<SessionData | null>;

    /**
     * Gets full session data for all of an identity's sessions
     */
    getIdentitySessionsData(identity: string): Promise<SessionData[]>;

    /**
     * Removes a session
     */
    removeSession(identity: string, sessionId: string): Promise<void>;

    /**
     * Gets all sessions IDs of an identity
     */
    getIdentityMcpSessions(identity: string): Promise<string[]>;

    /**
     * Gets all session IDs across all users (Admin)
     */
    getAllSessionIds(): Promise<string[]>;

    /**
     * Clears all sessions (Admin)
     */
    clearAll(): Promise<void>;

    /**
     * Clean up expired sessions
     */
    cleanupExpiredSessions(): Promise<void>;

    /**
     * Disconnect from storage backend
     */
    disconnect(): Promise<void>;

    // ============================================
    // Key-Value Storage (for OAuth data)
    // Following Cloudflare's agents pattern
    // ============================================

    /**
     * Get a value by key
     * @param key - Storage key
     * @returns Value or undefined if not found
     */
    get<T>(key: string): Promise<T | undefined>;

    /**
     * Set a value by key
     * @param key - Storage key
     * @param value - Value to store
     * @param ttl - Optional TTL in seconds
     */
    set<T>(key: string, value: T, ttl?: number): Promise<void>;

    /**
     * Delete a value by key
     * @param key - Storage key
     */
    delete(key: string): Promise<void>;

    /**
     * Delete multiple keys at once
     * @param keys - Array of storage keys
     */
    deleteMany?(keys: string[]): Promise<void>;
}
