import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type {
    OAuthClientInformation,
    OAuthClientInformationFull,
    OAuthClientMetadata,
    OAuthTokens
} from "@modelcontextprotocol/sdk/shared/auth.js";
import { nanoid } from "nanoid";
import { redis } from "./redis";
import { SESSION_TTL_SECONDS, TOKEN_EXPIRY_BUFFER_MS } from '../shared/constants';

interface StoredState {
    nonce: string;
    serverId: string;
    createdAt: number;
}

/**
 * Extension of OAuthClientProvider interface with additional methods
 * Enables server-specific tracking and state management
 */
export interface AgentsOAuthProvider extends OAuthClientProvider {
    authUrl: string | undefined;
    clientId: string | undefined;
    serverId: string | undefined;
    checkState(
        state: string
    ): Promise<{ valid: boolean; serverId?: string; error?: string }>;
    consumeState(state: string): Promise<void>;
    deleteCodeVerifier(): Promise<void>;
    isTokenExpired(): boolean;
    setTokenExpiresAt(expiresAt: number): void;
}

/**
 * Redis-backed OAuth provider implementation for MCP
 * Stores OAuth tokens, client information, and PKCE verifiers in Redis
 * All data is persisted alongside session metadata for stateless operation
 */
export class RedisOAuthClientProvider implements AgentsOAuthProvider {
    private _authUrl: string | undefined;
    private _clientId: string | undefined;
    private onRedirectCallback?: (url: string) => void;
    private tokenExpiresAt?: number;

    /**
     * Creates a new Redis-backed OAuth provider
     * @param identity - User/Client identifier
     * @param serverId - Server identifier
     * @param sessionId - Session identifier (used as OAuth state)
     * @param clientName - OAuth client name
     * @param baseRedirectUrl - OAuth callback URL
     * @param onRedirect - Optional callback when redirect to authorization is needed
     */
    constructor(
        public identity: string,
        public serverId: string,
        public sessionId: string,
        public clientName: string,
        public baseRedirectUrl: string,
        onRedirect?: (url: string) => void
    ) {
        this.onRedirectCallback = onRedirect;
    }

    get clientMetadata(): OAuthClientMetadata {
        return {
            client_name: this.clientName,
            client_uri: this.clientUri,
            grant_types: ["authorization_code", "refresh_token"],
            redirect_uris: [this.redirectUrl],
            response_types: ["code"],
            token_endpoint_auth_method: "none",
            ...(this._clientId ? { client_id: this._clientId } : {})
        };
    }

    get clientUri() {
        return new URL(this.redirectUrl).origin;
    }

    get redirectUrl() {
        return this.baseRedirectUrl;
    }

    get clientId() {
        return this._clientId;
    }

    set clientId(clientId_: string | undefined) {
        this._clientId = clientId_;
    }

    /**
     * Gets the Redis key for this session
     * @returns Redis key matching SessionStore format
     * @private
     */
    private getSessionKey(): string {
        return `mcp:session:${this.identity}:${this.sessionId}`;
    }

    /**
     * Loads OAuth data from Redis session
     * @returns OAuth data including tokens, client info, and verifier
     * @private
     */
    private async getSessionData(): Promise<{
        clientInformation?: OAuthClientInformationFull;
        tokens?: OAuthTokens;
        codeVerifier?: string;
        clientId?: string;
        tokenExpiresAt?: number;
    }> {
        const data = await redis.get(this.getSessionKey());
        if (!data) return {};
        try {
            return JSON.parse(data);
        } catch {
            return {};
        }
    }

    /**
     * Saves OAuth data to Redis, merging with existing session metadata
     * @param data - OAuth data to save
     * @private
     */
    private async saveSessionData(data: {
        clientInformation?: OAuthClientInformationFull;
        tokens?: OAuthTokens;
        codeVerifier?: string;
        clientId?: string;
        tokenExpiresAt?: number;
    }): Promise<void> {
        const existingData = await redis.get(this.getSessionKey());
        const existingSession = existingData ? JSON.parse(existingData) : {};

        const mergedData = {
            ...existingSession,
            ...data,
        };

        await redis.setex(this.getSessionKey(), SESSION_TTL_SECONDS, JSON.stringify(mergedData));
    }

    /**
     * Retrieves stored OAuth client information from Redis
     * @returns Client information or undefined if not found
     */
    async clientInformation(): Promise<OAuthClientInformation | undefined> {
        const data = await this.getSessionData();

        if (data.clientId && !this._clientId) {
            this._clientId = data.clientId;
        }

        return data.clientInformation;
    }

    /**
     * Stores OAuth client information in Redis
     * @param clientInformation - Client information from OAuth server
     */
    async saveClientInformation(clientInformation: OAuthClientInformationFull): Promise<void> {
        const data = await this.getSessionData();
        data.clientInformation = clientInformation;
        data.clientId = clientInformation.client_id;
        await this.saveSessionData(data);
        this.clientId = clientInformation.client_id;
    }

    /**
     * Stores OAuth tokens in Redis with expiration calculation
     * Automatically calculates token expiry with 5-minute buffer
     * @param tokens - OAuth tokens from authorization or refresh
     */
    async saveTokens(tokens: OAuthTokens): Promise<void> {
        const data = await this.getSessionData();
        data.tokens = tokens;

        if (tokens.expires_in) {
            this.tokenExpiresAt = Date.now() + (tokens.expires_in * 1000) - TOKEN_EXPIRY_BUFFER_MS;
            data.tokenExpiresAt = this.tokenExpiresAt;
        }

        await this.saveSessionData(data);
    }

    get authUrl() {
        return this._authUrl;
    }

    /**
     * Returns OAuth state parameter (uses sessionId)
     * @returns Session ID used as OAuth state
     */
    async state(): Promise<string> {
        return this.sessionId;
    }

    /**
     * Validates OAuth state parameter by checking session existence
     * @param state - OAuth state to validate
     * @returns Validation result with serverId if valid
     */
    async checkState(state: string): Promise<{ valid: boolean; serverId?: string; error?: string }> {
        const data = await redis.get(this.getSessionKey());

        if (!data) {
            return { valid: false, error: "Session not found" };
        }

        return { valid: true, serverId: this.serverId };
    }

    /**
     * Consumes OAuth state (no-op as sessionId is reused)
     * @param state - OAuth state
     */
    async consumeState(state: string): Promise<void> {
        // No-op: using sessionId directly, no separate state tracking needed
    }

    /**
     * Handles redirect to OAuth authorization URL
     * @param authUrl - Authorization URL from OAuth server
     */
    async redirectToAuthorization(authUrl: URL): Promise<void> {
        this._authUrl = authUrl.toString();
        if (this.onRedirectCallback) {
            this.onRedirectCallback(authUrl.toString());
        }
    }

    /**
     * Invalidates OAuth credentials in Redis
     * @param scope - What to invalidate: "all", "client", "tokens", or "verifier"
     */
    async invalidateCredentials(
        scope: "all" | "client" | "tokens" | "verifier"
    ): Promise<void> {
        if (scope === "all") {
            await redis.del(this.getSessionKey());
        } else {
            const data = await this.getSessionData();
            if (scope === "client") {
                delete data.clientInformation;
                delete data.clientId;
            } else if (scope === "tokens") {
                delete data.tokens;
            } else if (scope === "verifier") {
                delete data.codeVerifier;
            }
            await this.saveSessionData(data);
        }
    }

    /**
     * Stores PKCE code verifier in Redis
     * @param verifier - PKCE code verifier string
     */
    async saveCodeVerifier(verifier: string): Promise<void> {
        const data = await this.getSessionData();
        data.codeVerifier = verifier;
        await this.saveSessionData(data);
    }

    /**
     * Retrieves stored PKCE code verifier
     * @returns Code verifier string
     * @throws {Error} When no code verifier is found
     */
    async codeVerifier(): Promise<string> {
        const data = await this.getSessionData();

        if (data.clientId && !this._clientId) {
            this._clientId = data.clientId;
        }

        if (!data.codeVerifier) {
            throw new Error("No code verifier found");
        }
        return data.codeVerifier;
    }

    /**
     * Removes code verifier from Redis
     */
    async deleteCodeVerifier(): Promise<void> {
        const data = await this.getSessionData();
        delete data.codeVerifier;
        await this.saveSessionData(data);
    }

    /**
     * Retrieves stored OAuth tokens from Redis
     * Restores token expiration timestamp to memory
     * @returns OAuth tokens or undefined if not found
     */
    async tokens(): Promise<OAuthTokens | undefined> {
        const data = await this.getSessionData();

        if (data.clientId && !this._clientId) {
            this._clientId = data.clientId;
        }

        if (data.tokenExpiresAt && !this.tokenExpiresAt) {
            this.tokenExpiresAt = data.tokenExpiresAt;
        }

        return data.tokens;
    }

    /**
     * Checks if the access token is expired
     * Must call tokens() first to load expiration timestamp from Redis
     * @returns True if expired, false otherwise
     */
    isTokenExpired(): boolean {
        if (!this.tokenExpiresAt) {
            return false;
        }
        return Date.now() >= this.tokenExpiresAt;
    }

    /**
     * Sets the token expiration timestamp
     * @param expiresAt - Expiration timestamp in milliseconds
     */
    setTokenExpiresAt(expiresAt: number): void {
        this.tokenExpiresAt = expiresAt;
    }
}
