
import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type {
    OAuthClientInformation,
    OAuthClientInformationFull,
    OAuthClientMetadata,
    OAuthTokens
} from "@modelcontextprotocol/sdk/shared/auth.js";
import { storage } from "../storage/index.js";
import { TOKEN_EXPIRY_BUFFER_MS, STATE_EXPIRATION_MS } from '../../shared/constants.js';

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

interface StoredState {
    nonce: string;
    serverId: string;
    createdAt: number;
}

/**
 * Storage-backed OAuth provider implementation for MCP
 * Following Cloudflare's agents pattern: stores OAuth data separately from session data
 * using structured key-value storage.
 *
 * Key structure:
 * - oauth/{identity}/{serverId}/{clientId}/client_info - Client information
 * - oauth/{identity}/{serverId}/{clientId}/tokens - OAuth tokens
 * - oauth/{identity}/{serverId}/{clientId}/code_verifier - PKCE code verifier
 * - oauth/{identity}/{serverId}/state/{nonce} - OAuth state (expires in 10 min)
 */
export class StorageOAuthClientProvider implements AgentsOAuthProvider {
    private _authUrl: string | undefined;
    private _clientId: string | undefined;
    private onRedirectCallback?: (url: string) => void;
    private tokenExpiresAt?: number;

    /**
     * Creates a new Storage-backed OAuth provider
     * @param identity - User/Client identifier
     * @param serverId - Server identifier (for tracking which server this OAuth session belongs to)
     * @param sessionId - Session identifier (used for state validation)
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

    // ============================================
    // Key generation (following Cloudflare pattern)
    // ============================================

    private keyPrefix(clientId: string): string {
        return `oauth/${this.identity}/${this.serverId}/${clientId}`;
    }

    private clientInfoKey(clientId: string): string {
        return `${this.keyPrefix(clientId)}/client_info`;
    }

    private tokenKey(clientId: string): string {
        return `${this.keyPrefix(clientId)}/tokens`;
    }

    private codeVerifierKey(clientId: string): string {
        return `${this.keyPrefix(clientId)}/code_verifier`;
    }

    private stateKey(nonce: string): string {
        return `oauth/${this.identity}/${this.serverId}/state/${nonce}`;
    }

    /**
     * Key for storing clientId at server level (not nested under clientId)
     * This allows us to retrieve clientId when the provider is recreated
     */
    private serverClientIdKey(): string {
        return `oauth/${this.identity}/${this.serverId}/client_id`;
    }

    /**
     * Get clientId - loads from storage if not already set in memory
     * Called during OAuth flow restoration (similar to Cloudflare's restoreConnectionsFromStorage)
     */
    async getClientId(): Promise<string | undefined> {
        if (this._clientId) {
            return this._clientId;
        }
        const storedClientId = await storage.get<string>(this.serverClientIdKey());
        if (storedClientId) {
            this._clientId = storedClientId;
        }
        return this._clientId;
    }

    // ============================================
    // OAuthClientProvider implementation
    // ============================================

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

    get authUrl() {
        return this._authUrl;
    }

    /**
     * Retrieves stored OAuth client information
     */
    async clientInformation(): Promise<OAuthClientInformation | undefined> {
        // Try to load clientId from storage if not set
        if (!this._clientId) {
            await this.getClientId();
        }
        if (!this._clientId) {
            return undefined;
        }
        return await storage.get<OAuthClientInformation>(this.clientInfoKey(this._clientId));
    }

    /**
     * Stores OAuth client information
     */
    async saveClientInformation(clientInformation: OAuthClientInformationFull): Promise<void> {
        // Store clientId at server level for later retrieval
        await storage.set(this.serverClientIdKey(), clientInformation.client_id);
        // Store full client info
        await storage.set(this.clientInfoKey(clientInformation.client_id), clientInformation);
        this._clientId = clientInformation.client_id;
    }

    /**
     * Retrieves stored OAuth tokens
     */
    async tokens(): Promise<OAuthTokens | undefined> {
        // Try to load clientId from storage if not set
        if (!this._clientId) {
            await this.getClientId();
        }
        if (!this._clientId) {
            return undefined;
        }
        return await storage.get<OAuthTokens>(this.tokenKey(this._clientId));
    }

    /**
     * Stores OAuth tokens
     */
    async saveTokens(tokens: OAuthTokens): Promise<void> {
        // Try to load clientId from storage if not set
        if (!this._clientId) {
            await this.getClientId();
        }
        if (!this._clientId) {
            console.warn('[OAuth] Cannot save tokens without clientId');
            return;
        }

        if (tokens.expires_in) {
            this.tokenExpiresAt = Date.now() + (tokens.expires_in * 1000) - TOKEN_EXPIRY_BUFFER_MS;
        }

        await storage.set(this.tokenKey(this._clientId), tokens);
    }

    /**
     * Generates and stores OAuth state
     * Returns format: {sessionId} (we use sessionId as state for simplicity)
     */
    async state(): Promise<string> {
        // We use sessionId as state - simple and effective
        // The session existence check validates the state
        return this.sessionId;
    }

    /**
     * Validates OAuth state
     */
    async checkState(state: string): Promise<{ valid: boolean; serverId?: string; error?: string }> {
        // State is the sessionId - check if session exists
        const session = await storage.getSession(this.identity, state);

        if (!session) {
            return { valid: false, error: "Session not found or expired" };
        }

        // Check if session matches this server
        if (session.serverId !== this.serverId) {
            return { valid: false, error: "State serverId mismatch" };
        }

        return { valid: true, serverId: this.serverId };
    }

    /**
     * Consume state (no-op since we use session-based state)
     */
    async consumeState(state: string): Promise<void> {
        // No-op - state is tied to session lifecycle
    }

    /**
     * Handle redirect to authorization URL
     */
    async redirectToAuthorization(authUrl: URL): Promise<void> {
        this._authUrl = authUrl.toString();
        if (this.onRedirectCallback) {
            this.onRedirectCallback(authUrl.toString());
        }
    }

    /**
     * Invalidate credentials based on scope
     */
    async invalidateCredentials(
        scope: "all" | "client" | "tokens" | "verifier"
    ): Promise<void> {
        // Try to load clientId from storage if not set
        if (!this._clientId) {
            await this.getClientId();
        }

        const deleteKeys: string[] = [];

        if (scope === "all" || scope === "client") {
            // Delete server-level clientId
            deleteKeys.push(this.serverClientIdKey());
            if (this._clientId) {
                deleteKeys.push(this.clientInfoKey(this._clientId));
            }
        }
        if (this._clientId) {
            if (scope === "all" || scope === "tokens") {
                deleteKeys.push(this.tokenKey(this._clientId));
            }
            if (scope === "all" || scope === "verifier") {
                deleteKeys.push(this.codeVerifierKey(this._clientId));
            }
        }

        // Also clean up pending verifier
        if (scope === "all" || scope === "verifier") {
            deleteKeys.push(`oauth/${this.identity}/${this.serverId}/pending_verifier`);
        }

        if (deleteKeys.length > 0) {
            if (storage.deleteMany) {
                await storage.deleteMany(deleteKeys);
            } else {
                for (const key of deleteKeys) {
                    await storage.delete(key);
                }
            }
        }
    }

    /**
     * Store PKCE code verifier
     */
    async saveCodeVerifier(verifier: string): Promise<void> {
        if (!this._clientId) {
            // ClientId not set yet - this happens during initial OAuth flow
            // Store with a temporary key using serverId
            const tempKey = `oauth/${this.identity}/${this.serverId}/pending_verifier`;

            // Only save if not already exists (prevent overwrite)
            const existing = await storage.get<string>(tempKey);
            if (!existing) {
                await storage.set(tempKey, verifier);
            }
            return;
        }

        const key = this.codeVerifierKey(this._clientId);

        // Only save if not already exists (prevent overwrite)
        const existing = await storage.get<string>(key);
        if (!existing) {
            await storage.set(key, verifier);
        }
    }

    /**
     * Retrieve PKCE code verifier
     */
    async codeVerifier(): Promise<string> {
        // First try with clientId
        if (this._clientId) {
            const verifier = await storage.get<string>(this.codeVerifierKey(this._clientId));
            if (verifier) {
                return verifier;
            }
        }

        // Fall back to pending verifier (before clientId is set)
        const tempKey = `oauth/${this.identity}/${this.serverId}/pending_verifier`;
        const pendingVerifier = await storage.get<string>(tempKey);

        if (pendingVerifier) {
            return pendingVerifier;
        }

        throw new Error("No code verifier found");
    }

    /**
     * Delete PKCE code verifier
     */
    async deleteCodeVerifier(): Promise<void> {
        const keysToDelete: string[] = [];

        if (this._clientId) {
            keysToDelete.push(this.codeVerifierKey(this._clientId));
        }

        // Also clean up pending verifier
        keysToDelete.push(`oauth/${this.identity}/${this.serverId}/pending_verifier`);

        if (storage.deleteMany) {
            await storage.deleteMany(keysToDelete);
        } else {
            for (const key of keysToDelete) {
                await storage.delete(key);
            }
        }
    }

    /**
     * Check if token is expired
     */
    isTokenExpired(): boolean {
        if (!this.tokenExpiresAt) {
            return false;
        }
        return Date.now() >= this.tokenExpiresAt;
    }

    /**
     * Set token expiration time
     */
    setTokenExpiresAt(expiresAt: number): void {
        this.tokenExpiresAt = expiresAt;
    }
}
