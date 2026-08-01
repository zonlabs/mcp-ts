import { AsyncLocalStorage } from 'node:async_hooks';
import type {
    OAuthClientProvider,
    OAuthClientMetadata,
    OAuthClientInformationMixed,
    OAuthTokens,
    OAuthClientInformationContext,
    OAuthDiscoveryState,
    StoredOAuthClientInformation,
    StoredOAuthTokens,
} from "@modelcontextprotocol/client";
import { nanoid } from "nanoid";
import { sessions, type SessionCredentials, type SessionStore } from "../storage/index.js";
import {
    DEFAULT_CLIENT_NAME,
    DEFAULT_CLIENT_URI,
    DEFAULT_LOGO_URI,
    DEFAULT_POLICY_URI,
    SOFTWARE_ID,
    SOFTWARE_VERSION,
    STATE_EXPIRATION_MS,
} from '../../shared/constants.js';
import { formatOAuthState, parseOAuthState } from '../../shared/utils.js';

/**
 * Context stored in AsyncLocalStorage for callback-time code verifier resolution.
 * Stores the raw verifier and method directly.
 * This avoids a DB read in codeVerifier() — the verifier is loaded once by the caller
 * (from session.credentials after get({includeCredentials: true})) and propagated through ALS.
 */
interface CodeVerifierContext {
    verifier: string;
    method: 'S256';
}

const codeVerifierContext = new AsyncLocalStorage<CodeVerifierContext>();

/**
 * Run a function inside a code verifier context, providing the raw verifier and method
 * so that codeVerifier() can return them without a DB read.
 */
export function runWithCodeVerifierState<T>(
    verifier: string,
    method: 'S256',
    fn: () => Promise<T>
): Promise<T> {
    return codeVerifierContext.run({ verifier, method }, fn);
}

function base64UrlEncode(bytes: Uint8Array): string {
    let binary = "";
    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }
    return btoa(binary)
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
}

async function createCodeChallenge(verifier: string): Promise<string> {
    const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(verifier)
    );
    return base64UrlEncode(new Uint8Array(digest));
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
}

export interface StorageOAuthClientProviderOptions {
    userId: string;
    serverId: string;
    sessionId: string;
    redirectUrl: string;
    clientName?: string;
    clientUri?: string;
    logoUri?: string;
    policyUri?: string;
    clientInformation?: StoredOAuthClientInformation | OAuthClientInformationMixed;
    cachedTokens?: OAuthTokens;
    sessionStore?: SessionStore;
    onRedirect?: (url: string) => void;
}

/**
 * Storage-backed OAuth provider implementation for MCP
 * Stores OAuth tokens, client information, and PKCE verifiers using the configured SessionStore
 */
export class StorageOAuthClientProvider implements AgentsOAuthProvider {
    public readonly userId: string;
    public readonly serverId: string;
    public readonly sessionId: string;
    public readonly redirectUrl: string;

    private readonly clientName?: string;
    private readonly clientUri?: string;
    private readonly logoUri?: string;
    private readonly policyUri?: string;
    private readonly staticClientInformation?: StoredOAuthClientInformation;

    private _store: SessionStore;
    private _authUrl: string | undefined;
    private _clientId: string | undefined;
    private _cachedCodeVerifier: string | undefined;
    private _hasCodeVerifier = false;
    private _cachedTokens: OAuthTokens | null | undefined;
    private onRedirectCallback?: (url: string) => void;

    /**
     * Creates a new session-backed OAuth provider
     * @param options - Provider configuration
     */
    constructor(options: StorageOAuthClientProviderOptions) {
        this.userId = options.userId;
        this.serverId = options.serverId;
        this.sessionId = options.sessionId;
        this.redirectUrl = options.redirectUrl;
        this.clientName = options.clientName;
        this.clientUri = options.clientUri;
        this.logoUri = options.logoUri;
        this.policyUri = options.policyUri;
        this.staticClientInformation = options.clientInformation as StoredOAuthClientInformation | undefined;
        if (options.clientInformation?.client_id) {
            this._clientId = options.clientInformation.client_id;
        }
        this._cachedTokens = options.cachedTokens;
        this._store = options.sessionStore ?? sessions;
        this.onRedirectCallback = options.onRedirect;
    }

    get clientMetadata(): OAuthClientMetadata {
        return {
            client_name: this.clientName || DEFAULT_CLIENT_NAME,
            client_uri: this.clientUri || DEFAULT_CLIENT_URI,
            logo_uri: this.logoUri || DEFAULT_LOGO_URI,
            policy_uri: this.policyUri || DEFAULT_POLICY_URI,
            grant_types: ["authorization_code", "refresh_token"],
            redirect_uris: [this.redirectUrl],
            response_types: ["code"],
            token_endpoint_auth_method: "none",
            software_id: SOFTWARE_ID,
            software_version: SOFTWARE_VERSION,
        };
    }

    get clientId() {
        return this._clientId;
    }

    set clientId(clientId_: string | undefined) {
        this._clientId = clientId_;
    }

    /**
     * Loads OAuth credentials from the session store
     * @private
     */
    private async getCredentials(): Promise<SessionCredentials> {
        const data = await this._store.getCredentials(this.userId, this.sessionId);
        if (!data) {
            return { userId: this.userId, sessionId: this.sessionId };
        }
        return data;
    }

    /**
     * Saves OAuth credentials to the session store
     * @param data - Partial OAuth credentials to save
     * @private
     * @throws Error if session doesn't exist (session must be created by controller layer)
     */
    private async patchCredentials(data: Partial<SessionCredentials>): Promise<void> {
        await this._store.patchCredentials(this.userId, this.sessionId, data);
    }

    /**
     * Retrieves stored OAuth client information.
     */
    async clientInformation(
        _context?: OAuthClientInformationContext
    ): Promise<StoredOAuthClientInformation | undefined> {
        if (this.staticClientInformation) {
            return this.staticClientInformation as StoredOAuthClientInformation;
        }

        const data = await this.getCredentials();

        // Pre-cache tokens (or absent sentinel) so subsequent tokens() call is 0 DB reads
        if (this._cachedTokens === undefined) {
            this._cachedTokens = data.tokens ?? null;
        }

        if (data.clientId) {
            this._clientId = data.clientId;
            if (data.clientInformation) {
                return data.clientInformation as StoredOAuthClientInformation;
            }
            return {
                client_id: data.clientId,
            };
        }

        return undefined;
    }

    /**
     * Stores OAuth client information
     */
    async saveClientInformation(
        clientInformation: StoredOAuthClientInformation,
        _context?: OAuthClientInformationContext
    ): Promise<void> {
        await this.patchCredentials({
            clientInformation,
            clientId: clientInformation.client_id
        });
        this.clientId = clientInformation.client_id;
    }

    /**
     * Stores OAuth tokens
     */
    async saveTokens(
        tokens: StoredOAuthTokens,
        _context?: OAuthClientInformationContext
    ): Promise<void> {
        await this.patchCredentials({ tokens });
        this._cachedTokens = tokens;
    }

    /**
     * Retrieves stored OAuth discovery state
     */
    async discoveryState(): Promise<OAuthDiscoveryState | undefined> {
        const data = await this.getCredentials();
        return data.discoveryState ?? undefined;
    }

    /**
     * Stores OAuth discovery state
     */
    async saveDiscoveryState(discoveryState: OAuthDiscoveryState): Promise<void> {
        await this.patchCredentials({ discoveryState });
    }

    get authUrl() {
        return this._authUrl;
    }

    async state(): Promise<string> {
        this._cachedCodeVerifier = undefined;
        this._hasCodeVerifier = false;
        const nonce = nanoid(32);
        await this.patchCredentials({
            oauthState: {
                nonce,
                sessionId: this.sessionId,
                serverId: this.serverId,
                createdAt: Date.now(),
            },
            codeVerifier: null,
        });
        return formatOAuthState(nonce, this.sessionId);
    }

    async checkState(state: string): Promise<{ valid: boolean; serverId?: string; error?: string }> {
        const parsed = parseOAuthState(state);
        if (!parsed) {
            return { valid: false, error: "Invalid OAuth state" };
        }

        if (parsed.sessionId !== this.sessionId) {
            return { valid: false, error: "OAuth state mismatch" };
        }

        const data = await this._store.getCredentials(this.userId, parsed.sessionId);

        if (!data) {
            return { valid: false, error: "Session not found" };
        }

        const oauthState = data.oauthState;
        if (!oauthState) {
            return { valid: false, error: "OAuth state not found" };
        }

        if (
            oauthState.nonce !== parsed.nonce ||
            oauthState.sessionId !== parsed.sessionId ||
            oauthState.serverId !== this.serverId
        ) {
            return { valid: false, error: "OAuth state mismatch" };
        }

        if (Date.now() - oauthState.createdAt > STATE_EXPIRATION_MS) {
            return { valid: false, error: "OAuth state expired" };
        }

        return { valid: true, serverId: oauthState.serverId };
    }

    async consumeState(state: string): Promise<void> {
        const result = await this.checkState(state);
        if (!result.valid) {
            throw new Error(result.error || "Invalid OAuth state");
        }

        await this.patchCredentials({ oauthState: null });
    }

    async redirectToAuthorization(authUrl: URL): Promise<void> {
        this._authUrl = authUrl.toString();

        // Extract PKCE parameters from auth URL and persist verifier
        // keyed by state nonce for callback-time retrieval.
        const codeChallenge = authUrl.searchParams.get("code_challenge");
        const state = authUrl.searchParams.get("state");

        if (this._cachedCodeVerifier && codeChallenge && state) {
            const expectedChallenge = await createCodeChallenge(this._cachedCodeVerifier);
            if (expectedChallenge === codeChallenge) {
                const parsed = parseOAuthState(state);
                if (parsed) {
                    await this.patchCredentials({
                        codeVerifier: this._cachedCodeVerifier,
                    });
                }
            }
        }

        if (this.onRedirectCallback) {
            this.onRedirectCallback(authUrl.toString());
        }
    }

    async invalidateCredentials(
        scope: "all" | "client" | "tokens" | "verifier"
    ): Promise<void> {
        if (scope === "all") {
            this._cachedTokens = undefined;
            await this._store.delete(this.userId, this.sessionId);
        } else {
            const updates: Partial<SessionCredentials> = {};

            if (scope === "client") {
                updates.clientInformation = null;
                updates.clientId = null;
            } else if (scope === "tokens") {
                this._cachedTokens = undefined;
                updates.tokens = null;
            } else if (scope === "verifier") {
                this._cachedCodeVerifier = undefined;
                this._hasCodeVerifier = false;
                updates.codeVerifier = null;
            }
            await this.patchCredentials(updates);
        }
    }

    async saveCodeVerifier(verifier: string): Promise<void> {
        if (this._hasCodeVerifier) {
            return;
        }

        this._cachedCodeVerifier = verifier;
        this._hasCodeVerifier = true;
    }

    async codeVerifier(): Promise<string> {
        if (this._cachedCodeVerifier) {
            return this._cachedCodeVerifier;
        }

        // ALS context carries the raw verifier directly (set by the caller via
        // runWithCodeVerifierState), avoiding a DB read at callback time.
        const ctx = codeVerifierContext.getStore();
        if (ctx?.verifier) {
            return ctx.verifier;
        }

        // Cross-instance fallback: read verifier from DB (no ALS context).
        const data = await this.getCredentials();
        if (data.codeVerifier) {
            return data.codeVerifier;
        }

        throw new Error("No code verifier found");
    }

    async deleteCodeVerifier(): Promise<void> {
        this._cachedCodeVerifier = undefined;
        this._hasCodeVerifier = false;
        await this.patchCredentials({
            codeVerifier: null,
        });
    }

    async tokens(_context?: OAuthClientInformationContext): Promise<StoredOAuthTokens | undefined> {
        if (this._cachedTokens !== undefined) {
            return (this._cachedTokens ?? undefined) as StoredOAuthTokens | undefined;
        }

        const data = await this.getCredentials();

        this._cachedTokens = data.tokens ?? null;

        if (data.clientId && !this._clientId) {
            this._clientId = data.clientId;
        }

        return (data.tokens ?? undefined) as StoredOAuthTokens | undefined;
    }
}
