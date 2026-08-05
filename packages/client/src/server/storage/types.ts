
import type { MCPClient } from '../mcp/oauth-client.js';
import type {
    OAuthTokens,
    OAuthClientInformationMixed,
    StoredOAuthTokens,
    StoredOAuthClientInformation,
    OAuthDiscoveryState,
    ClientOptions,
    DiscoverResult,
} from "@modelcontextprotocol/client";

export interface OAuthState {
    nonce: string;
    sessionId: string;
    serverId: string;
    createdAt: number;
}

export type SessionStatus = 'pending' | 'active';

export type ToolPolicyMode = 'all' | 'allowlist' | 'denylist';
export type StoredMcpTransportType = 'sse' | 'streamable-http';

export interface StoredMcpTransportOptions {
    type?: StoredMcpTransportType;
    protocolVersion?: string;
}

export type StoredMcpSdkClientOptions = Pick<
    ClientOptions,
    | 'capabilities'
    | 'versionNegotiation'
    | 'inputRequired'
    | 'supportedProtocolVersions'
    | 'enforceStrictCapabilities'
    | 'listMaxPages'
    | 'cachePartition'
    | 'defaultCacheTtlMs'
>;

export interface StoredMcpServerOptions {
    client?: StoredMcpSdkClientOptions;
    transport?: StoredMcpTransportOptions;
    discoverResult?: DiscoverResult;
}
export interface ToolPolicy {
    mode: ToolPolicyMode;
    toolIds: string[];
    updatedAt: number;
}

export interface Session {
    sessionId: string;
    serverId?: string; // Database server ID for mapping
    serverName?: string;
    serverUrl: string;
    serverOptions?: StoredMcpServerOptions | null;
    callbackUrl: string;
    createdAt: number;
    updatedAt?: number;
    /**
     * Storage-owned expiration timestamp for pending/inactive sessions.
     * Active sessions use updatedAt-based dormancy cleanup instead.
     */
    expiresAt?: number | null;
    userId: string;
    headers?: Record<string, string>;
    authUrl?: string | null;
    /**
     * Session status marker used for lifecycle cleanup:
     * - pending: short-lived intermediate/auth-pending session state
     * - active: restorable session after successful connection/auth completion
     */
    status?: SessionStatus;
    toolPolicy?: ToolPolicy;
    /** When false, the session is excluded from agent tool discovery and RPC access. Defaults to true. */
    enabled?: boolean;
    clientInformation?: StoredOAuthClientInformation | OAuthClientInformationMixed | null;
    tokens?: StoredOAuthTokens | OAuthTokens | null;
    discoveryState?: OAuthDiscoveryState | null;
    codeVerifier?: string | null;
    codeVerifierChallenge?: string | null;
    codeVerifierNonce?: string | null;
    clientId?: string | null;
    oauthState?: OAuthState | null;
}

export interface SessionCredentials {
    sessionId: string;
    userId: string;
    clientInformation?: StoredOAuthClientInformation | OAuthClientInformationMixed | null;
    tokens?: StoredOAuthTokens | OAuthTokens | null;
    discoveryState?: OAuthDiscoveryState | null;
    codeVerifier?: string | null;
    codeVerifierChallenge?: string | null;
    codeVerifierNonce?: string | null;
    clientId?: string | null;
    oauthState?: OAuthState | null;
}

export type SessionMutationType = 'create' | 'update' | 'delete';

export interface SessionMutationEvent {
    type: SessionMutationType;
    userId: string;
    sessionId: string;
    timestamp: number;
    session?: Session;
    patch?: Partial<Session>;
}

export type SessionMutationListener = (event: SessionMutationEvent) => void | Promise<void>;

export interface SetClientOptions {
    sessionId: string;
    serverId?: string; // Database server ID
    serverName?: string; // Human-readable server name
    client?: MCPClient;
    serverUrl?: string;
    callbackUrl?: string;
    serverOptions?: StoredMcpServerOptions | null;
    userId?: string;
    headers?: Record<string, string>;
}

/**
 * Interface for MCP session stores.
 */
export type GetOptions = {
    includeCredentials?: boolean;
};

export type SessionResult = Session;

export interface SessionStore {
    /**
     * Optional initialization (e.g., database connection)
     */
    init?(): Promise<void>;

    /**
     * Generates a unique session ID
     */
    generateSessionId(): string;

    /**
     * Creates a new session. Throws if session already exists.
     * @param session - Session data to create
     */
    create(session: Session): Promise<void>;

    /**
     * Updates an existing session with partial data. Throws if session does not exist.
     * @param userId - User identifier
     * @param sessionId - Session identifier
     * @param data - Partial session data to update
     */
    update(userId: string, sessionId: string, data: Partial<Session>): Promise<void>;

    /**
     * Patches runtime credentials for an existing session.
     * These values are separated from connection metadata in durable SQL stores.
     */
    patchCredentials(userId: string, sessionId: string, data: Partial<SessionCredentials>): Promise<void>;

    /**
     * Retrieves a session, optionally including its credential fields in one round-trip.
     * When includeCredentials is true, the returned session has credential fields
     * (clientInformation, tokens, codeVerifier, etc.) populated from storage.
     * When false or undefined, credential fields are left as undefined.
     */
    get(userId: string, sessionId: string, options?: GetOptions): Promise<SessionResult | null>;

    /**
     * Retrieves runtime credentials for a session.
     */
    getCredentials(userId: string, sessionId: string): Promise<SessionCredentials | null>;

    /**
     * Clears runtime credentials without removing connection metadata.
     */
    clearCredentials(userId: string, sessionId: string): Promise<void>;

    /**
     * Gets full session data for all sessions owned by a user
     */
    list(userId: string): Promise<Session[]>;

    /**
     * Removes a session
     */
    delete(userId: string, sessionId: string): Promise<void>;

    /**
     * Gets all session IDs owned by a user
     */
    listIds(userId: string): Promise<string[]>;

    /**
     * Gets all session IDs across all users (Admin)
     */
    listAllIds(): Promise<string[]>;

    /**
     * Clears all sessions (Admin)
     */
    clearAll(): Promise<void>;

    /**
     * Clean up expired sessions
     */
    cleanupExpired(): Promise<void>;

    /**
     * Disconnect from storage backend
     */
    disconnect(): Promise<void>;
}
