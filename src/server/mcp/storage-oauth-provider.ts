
import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type {
    OAuthClientInformation,
    OAuthClientInformationFull,
    OAuthClientMetadata,
    OAuthTokens
} from "@modelcontextprotocol/sdk/shared/auth.js";
import { storage, SessionData } from "../storage/index.js";
import { TOKEN_EXPIRY_BUFFER_MS } from '../../shared/constants.js';

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
 * Storage-backed OAuth provider implementation for MCP
 * Stores OAuth tokens, client information, and PKCE verifiers using the configured StorageBackend
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
     * Loads OAuth data from storage session
     * @private
     */
    private async getSessionData(): Promise<SessionData> {
        const data = await storage.getSession(this.identity, this.sessionId);
        if (!data) {
            // Return empty/partial object if not found
            return {} as SessionData;
        }
        return data;
    }

    /**
     * Saves OAuth data to storage
     * @param data - Partial OAuth data to save
     * @private
     * @throws Error if session doesn't exist (session must be created by controller layer)
     */
    private async saveSessionData(data: Partial<SessionData>): Promise<void> {
        await storage.updateSession(this.identity, this.sessionId, data);
    }

    /**
     * Retrieves stored OAuth client information
     */
    async clientInformation(): Promise<OAuthClientInformation | undefined> {
        const data = await this.getSessionData();

        if (data.clientId && !this._clientId) {
            this._clientId = data.clientId;
        }

        return data.clientInformation;
    }

    /**
     * Stores OAuth client information
     */
    async saveClientInformation(clientInformation: OAuthClientInformationFull): Promise<void> {
        await this.saveSessionData({
            clientInformation,
            clientId: clientInformation.client_id
        });
        this.clientId = clientInformation.client_id;
    }

    /**
     * Stores OAuth tokens
     */
    async saveTokens(tokens: OAuthTokens): Promise<void> {
        const data: Partial<SessionData> = { tokens };

        if (tokens.expires_in) {
            this.tokenExpiresAt = Date.now() + (tokens.expires_in * 1000) - TOKEN_EXPIRY_BUFFER_MS;
        }

        await this.saveSessionData(data);
    }

    get authUrl() {
        return this._authUrl;
    }

    async state(): Promise<string> {
        return this.sessionId;
    }

    async checkState(state: string): Promise<{ valid: boolean; serverId?: string; error?: string }> {
        const data = await storage.getSession(this.identity, this.sessionId);

        if (!data) {
            return { valid: false, error: "Session not found" };
        }

        return { valid: true, serverId: this.serverId };
    }

    async consumeState(state: string): Promise<void> {
        // No-op
    }

    async redirectToAuthorization(authUrl: URL): Promise<void> {
        this._authUrl = authUrl.toString();
        if (this.onRedirectCallback) {
            this.onRedirectCallback(authUrl.toString());
        }
    }

    async invalidateCredentials(
        scope: "all" | "client" | "tokens" | "verifier"
    ): Promise<void> {
        if (scope === "all") {
            await storage.removeSession(this.identity, this.sessionId);
        } else {
            const data = await this.getSessionData();
            // Create a copy to modify
            const updates: Partial<SessionData> = {};

            if (scope === "client") {
                updates.clientInformation = undefined;
                updates.clientId = undefined;
            } else if (scope === "tokens") {
                updates.tokens = undefined;
            } else if (scope === "verifier") {
                updates.codeVerifier = undefined;
            }
            await this.saveSessionData(updates);
        }
    }

    async saveCodeVerifier(verifier: string): Promise<void> {
        await this.saveSessionData({ codeVerifier: verifier });
    }

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

    async deleteCodeVerifier(): Promise<void> {
        await this.saveSessionData({ codeVerifier: undefined });
    }

    async tokens(): Promise<OAuthTokens | undefined> {
        const data = await this.getSessionData();

        if (data.clientId && !this._clientId) {
            this._clientId = data.clientId;
        }

        return data.tokens;
    }

    isTokenExpired(): boolean {
        if (!this.tokenExpiresAt) {
            return false;
        }
        return Date.now() >= this.tokenExpiresAt;
    }

    setTokenExpiresAt(expiresAt: number): void {
        this.tokenExpiresAt = expiresAt;
    }
}
