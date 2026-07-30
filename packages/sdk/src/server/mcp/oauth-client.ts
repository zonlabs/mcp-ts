import { CallToolResultSchema, GetPromptResultSchema, ReadResourceResultSchema } from "@modelcontextprotocol/core";
import { Client, StreamableHTTPClientTransport, SSEClientTransport, UnauthorizedError as SDKUnauthorizedError, ProtocolError, ListToolsResult, CallToolRequest, CallToolResult, ListPromptsResult, GetPromptRequest, GetPromptResult, ListResourcesResult, ListResourceTemplatesResult, ReadResourceRequest, ReadResourceResult } from "@modelcontextprotocol/client";
import type { Tool, Prompt, Resource, ResourceTemplateType, Implementation, OAuthTokens, OAuthClientProvider, ClientCapabilities } from "@modelcontextprotocol/client";
import { nanoid } from 'nanoid';
import { StorageOAuthClientProvider, type AgentsOAuthProvider } from './storage-oauth-provider.js';
import { Emitter, type McpConnectionEvent, type McpObservabilityEvent, type McpConnectionState } from '../../shared/events.js';
import { UnauthorizedError } from '../../shared/errors.js';
import { sessions } from '../storage/index.js';
import type { Session, SessionStatus, SessionStore } from '../storage/types.js';
import {
  MCP_CLIENT_NAME,
  MCP_CLIENT_VERSION,
} from '../../shared/constants.js';
/**
 * Supported MCP transport types
 */
export type TransportType = 'sse' | 'streamable-http';

interface McpAppClientCapabilities extends Omit<ClientCapabilities, 'extensions'> {
  extensions?: {
    'io.modelcontextprotocol/ui'?: {
      mimeTypes: string[];
    };
    [key: string]: any;
  };
}

export interface MCPOAuthClientOptions {
  serverUrl?: string;
  serverName?: string;
  callbackUrl?: string;
  onRedirect?: (url: string) => void;
  userId: string;
  serverId?: string; /** Optional - loaded from session if not provided */
  sessionId: string; /** Required - primary key for session lookup */
  transportType?: TransportType;
  clientId?: string;
  clientSecret?: string;
  headers?: Record<string, string>;
  /** OAuth Client Metadata (optional - user application info) */
  clientName?: string;
  clientUri?: string;
  logoUri?: string;
  policyUri?: string;
  /**
   * Credentials already loaded by the caller (e.g. via get({includeCredentials: true})).
   * When provided, the StorageOAuthClientProvider uses these cached values to
   * skip redundant DB reads for tokens() calls during reconnection.
   */
  cachedCredentials?: { tokens?: OAuthTokens };
  /**
   * When true, skips the redundant session-existence check in ensureSession().
   * Set by callers that have already confirmed the session exists in storage
   * (e.g. getOrCreateClient, getSession, finishAuth in sse-handler).
   * Saves one round-trip per reconnection.
   */
  hasSession?: boolean;
  /**
   * Custom session store override. When provided, all storage operations
   * (get/create/update/delete) use this store instead of the default global.
   * Used for wrapping with DB observability or other decorators.
   */
  sessionStore?: SessionStore;
}

/**
 * MCP Client with OAuth 2.1 authentication support
 * Manages connections to MCP servers with automatic token refresh and session restoration
 * Emits connection lifecycle events for observability
 */
export class MCPClient {
  private client: Client;
  public oauthProvider: OAuthClientProvider | null = null;
  private transport: StreamableHTTPClientTransport | SSEClientTransport | null = null;
  private config!: MCPOAuthClientOptions;
  private createdAt?: number;
  private _serverInfo: Implementation | undefined;
  private _store!: SessionStore;

  /** Event emitters for connection lifecycle */
  private readonly _onConnectionEvent = new Emitter<McpConnectionEvent>();
  public readonly onConnectionEvent = this._onConnectionEvent.event;

  private readonly _onObservabilityEvent = new Emitter<McpObservabilityEvent>();
  public readonly onObservabilityEvent = this._onObservabilityEvent.event;

  private currentState: McpConnectionState = 'DISCONNECTED';

  private _capabilityErrorHandler<T>(empty: T, _methodName?: string): (error: unknown) => T {
    return (error: unknown): T => {
      if (error instanceof ProtocolError && error.code === -32601) {
        return empty;
      }
      throw error;
    };
  }

  /**
   * Creates a new MCP client instance
   * Can be initialized with minimal options (userId + sessionId) for session restoration
   * @param options - Client configuration options
   */
  constructor(options: MCPOAuthClientOptions) {
    this.config = { ...options };
    this._store = options.sessionStore ?? sessions;

    this.client = new Client(
      {
        name: MCP_CLIENT_NAME,
        version: MCP_CLIENT_VERSION,
      },
      {
        capabilities: {
          extensions: {
            'io.modelcontextprotocol/ui': {
              mimeTypes: ['text/html+mcp'],
            },
          },
        } as McpAppClientCapabilities,
      }
    );
  }

  /** Shared session-shaped data for ensureSession and saveSession */
  private get session() {
    return {
      sessionId: this.config.sessionId,
      userId: this.config.userId,
      serverId: this.config.serverId!,
      serverName: this.config.serverName,
      serverUrl: this.config.serverUrl!,
      callbackUrl: this.config.callbackUrl!,
      transportType: (this.config.transportType || 'streamable-http') as TransportType,
      headers: this.config.headers,
      createdAt: this.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    };
  }

  /**
   * Emit a connection state change event
   * @private
   */
  private emitStateChange(newState: McpConnectionState): void {
    const previousState = this.currentState;
    this.currentState = newState;

    if (!this.config.serverId) return;

    this._onConnectionEvent.fire({
      type: 'state_changed',
      sessionId: this.config.sessionId,
      serverId: this.config.serverId,
      serverName: this.config.serverName || this.config.serverId,
      serverUrl: this.config.serverUrl || '',
      createdAt: this.createdAt,
      state: newState,
      previousState,
      timestamp: Date.now(),
    });

    this._onObservabilityEvent.fire({
      type: 'mcp:client:state_change',
      level: 'info',
      message: `Connection state: ${previousState} → ${newState}`,
      displayMessage: `State changed to ${newState}`,
      sessionId: this.config.sessionId,
      serverId: this.config.serverId,
      payload: { previousState, newState },
      timestamp: Date.now(),
      id: nanoid(),
    });
  }

  /**
   * Emit an error event
   * @private
   */
  private emitError(error: string, errorType: 'connection' | 'auth' | 'validation' | 'unknown' = 'unknown'): void {
    if (!this.config.serverId) return;

    this._onConnectionEvent.fire({
      type: 'error',
      sessionId: this.config.sessionId,
      serverId: this.config.serverId,
      error,
      errorType,
      timestamp: Date.now(),
    });

    this._onObservabilityEvent.fire({
      type: 'mcp:client:error',
      level: 'error',
      message: error,
      displayMessage: error,
      sessionId: this.config.sessionId,
      serverId: this.config.serverId,
      payload: { errorType, error },
      timestamp: Date.now(),
      id: nanoid(),
    });
  }

  /**
   * Emit a progress event
   * @private
   */
  private emitProgress(message: string): void {
    if (!this.config.serverId) return;

    this._onConnectionEvent.fire({
      type: 'progress',
      sessionId: this.config.sessionId,
      serverId: this.config.serverId,
      message,
      timestamp: Date.now(),
    });
  }

  /**
   * Get current connection state
   */
  getConnectionState(): McpConnectionState {
    return this.currentState;
  }

  /**
   * Helper to create a transport instance
   * @param type - The transport type to create
   * @returns Configured transport instance
   * @private
   */
  private getTransport(type: TransportType): StreamableHTTPClientTransport | SSEClientTransport {
    if (!this.config.serverUrl) {
      throw new Error('Server URL is required to create transport');
    }

    const baseUrl = new URL(this.config.serverUrl);
    const hasAuthorizationHeader = Object.keys(this.config.headers || {})
      .some((key) => key.toLowerCase() === 'authorization');
    const transportOptions: Record<string, any> = {
      ...(!hasAuthorizationHeader && { authProvider: this.oauthProvider }),
      ...(this.config.headers && { requestInit: { headers: this.config.headers } }),
      /**
       * Custom fetch implementation to handle connection timeouts.
       * Observation: SDK 1.24.0+ connections may hang indefinitely in some environments.
       * This wrapper enforces a timeout and properly uses AbortController to unblock the request.
       */
      fetch: async (url: RequestInfo | URL, init?: RequestInit) => {
        const timeout = 30000;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        const signal = init?.signal ?
          // @ts-ignore: AbortSignal.any is available in Node 20+
          (AbortSignal.any ? AbortSignal.any([init.signal, controller.signal]) : controller.signal) :
          controller.signal;

        try {
          const response = await fetch(url, { ...init, signal });
          
          const hasSessionHeader = init?.headers && new Headers(init.headers as HeadersInit).has('mcp-session-id');

          if (response.status === 404 && hasSessionHeader) {
            throw new Error("MCP_SESSION_EXPIRED: Downstream session was not found on the server.");
          }

          return response;
        } finally {
          clearTimeout(timeoutId);
        }
      }
    };

    if (type === 'sse') {
      return new SSEClientTransport(baseUrl, transportOptions);
    } else {
      return new StreamableHTTPClientTransport(baseUrl, transportOptions);
    }
  }

  /**
   * Ensures session metadata and OAuth provider are loaded.
   * Does NOT create the SDK Client — callers that need one create it themselves.
   * @private
   */
  private async ensureSession(): Promise<void> {
    if (this.oauthProvider) return;

    this.emitStateChange('INITIALIZING');
    this.emitProgress('Loading session configuration...');

    if (!this.config.serverUrl || !this.config.callbackUrl || !this.config.serverId) {
      const existingSession = await this._store.get(this.config.userId, this.config.sessionId);
      if (!existingSession) {
        throw new Error(`Session not found: ${this.config.sessionId}`);
      }

      this.config.serverUrl = this.config.serverUrl || existingSession.serverUrl;
      this.config.callbackUrl = this.config.callbackUrl || existingSession.callbackUrl;
      this.config.serverName = this.config.serverName || existingSession.serverName;
      this.config.serverId = this.config.serverId || existingSession.serverId || 'unknown';
      this.config.headers = this.config.headers || existingSession.headers;
      this.createdAt = existingSession.createdAt;
    }

    if (!this.config.serverUrl || !this.config.callbackUrl || !this.config.serverId) {
      throw new Error('Missing required connection metadata');
    }

    this.oauthProvider = new StorageOAuthClientProvider({
      userId: this.config.userId,
      serverId: this.config.serverId!,
      sessionId: this.config.sessionId,
      redirectUrl: this.config.callbackUrl!,
      clientName: this.config.clientName,
      clientUri: this.config.clientUri,
      logoUri: this.config.logoUri,
      policyUri: this.config.policyUri,
      clientId: this.config.clientId,
      clientSecret: this.config.clientSecret,
      cachedTokens: this.config.cachedCredentials?.tokens,
      sessionStore: this._store,
      onRedirect: (redirectUrl: string) => {
        if (this.config.serverId) {
          this._onConnectionEvent.fire({
            type: 'auth_required',
            sessionId: this.config.sessionId,
            serverId: this.config.serverId,
            authUrl: redirectUrl,
            timestamp: Date.now(),
          });
        }
        if (this.config.onRedirect) {
          this.config.onRedirect(redirectUrl);
        }
      },
    });

    // Create session row BEFORE persisting credentials (FK constraint on mcp_credentials)
    // When hasSession is set by the caller, the session is guaranteed
    // to exist — skip the redundant round-trip.
    const existingSession = this.config.hasSession ? {} as Session : await this._store.get(this.config.userId, this.config.sessionId);
    if (!existingSession) {
      this.createdAt = Date.now();
      const updatedAt = this.createdAt;
      this._onObservabilityEvent.fire({
        type: 'mcp:client:session_created',
        level: 'info',
        message: `Creating pending session ${this.config.sessionId} for connection setup`,
        sessionId: this.config.sessionId,
        serverId: this.config.serverId,
        timestamp: Date.now(),
        id: nanoid(),
      });
      await this._store.create({
        ...this.session,
        updatedAt,
        status: 'pending',
      });
    }

    // Only persist credentials on first connect. Existing sessions already have
    // credentials from the initial connect — no DB read needed to verify.
    if (!existingSession && this.oauthProvider instanceof StorageOAuthClientProvider) {
        await this.oauthProvider.initializeCredentials();
    }
  }

  /**
   * Saves current session state to the session store
   * Creates new session if it doesn't exist, updates if it does
   * @param status - Session lifecycle status used by storage cleanup
   * @private
   */
  private async saveSession(status: SessionStatus = 'active'): Promise<void> {
    if (!this.config.sessionId || !this.config.serverId || !this.config.serverUrl || !this.config.callbackUrl) {
      return;
    }

    const existing = await this._store.get(this.config.userId, this.config.sessionId);
    if (!existing) {
      await this._store.create({
        ...this.session,
        status,
      });
    } else {
      await this._store.update(this.config.userId, this.config.sessionId, {
        ...this.session,
        status,
      });
    }
  }

  /**
   * Removes transient setup/auth sessions without masking the original error.
   * @private
   */
  private async deleteTransientSession(): Promise<void> {
    try {
      await this._store.delete(this.config.userId, this.config.sessionId);
    } catch {
      // Best effort only: preserve the original connection/auth error.
    }
  }

  /**
   * Try to connect using available transports
   * @returns The corrected transport type object if successful
   * @private
   */
  private async tryConnect(): Promise<{ transportType: TransportType }> {
    /**
     * If exact transport type is known, only try that.
     * Otherwise (auto mode), try streamable_http first, then sse.
     */
    const transportsToTry: TransportType[] = this.config.transportType
      ? [this.config.transportType]
      : ['streamable-http', 'sse'];

    let lastError: unknown;

    for (const currentType of transportsToTry) {
      const isLastAttempt = currentType === transportsToTry[transportsToTry.length - 1];

      try {
        const transport = this.getTransport(currentType);

        /** Update local state with the transport we are about to try */
        this.transport = transport;

        /** Race connection against timeout */
        await this.client!.connect(transport);

        /** Capture server metadata from the initialize response */
        this._serverInfo = this.client.getServerVersion();

        /** Success! Return the type that worked */
        return { transportType: currentType };

      } catch (error: any) {
        lastError = error;

        /** Check for Auth Errors - these should fail immediately, no fallback */
        const isAuthError = error instanceof SDKUnauthorizedError ||
          (error instanceof Error && error.message.toLowerCase().includes('unauthorized'));

        if (isAuthError) {
          throw error;
        }

        /** If this was the last transport to try, throw the error */
        if (isLastAttempt) {
          throw error;
        }

        /** Otherwise, log and continue to next transport */
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.emitProgress(`Connection attempt with ${currentType} failed: ${errorMessage}. Retrying...`);
        this._onObservabilityEvent.fire({
          level: 'warn',
          message: `Transport ${currentType} failed, falling back`,
          sessionId: this.config.sessionId,
          serverId: this.config.serverId,
          metadata: {
            failedTransport: currentType,
            error: errorMessage
          },
          timestamp: Date.now(),
        });
      }
    }

    throw lastError || new Error('No transports available');
  }

  /**
   * Connects to the MCP server.
   *
   * Automatically validates and refreshes OAuth tokens if needed.
   * Saves the session on first successful connection.
   *
   * The in-memory tools cache (`cachedTools`) is cleared at the start of every
   * call so that a reconnection always fetches a fresh tool list from the remote
   * server — even if the same `MCPClient` instance is reused.
   *
   * @throws {UnauthorizedError} When OAuth authorization is required.
   * @throws {Error} When connection fails for other reasons.
   */
  async connect(): Promise<void> {
    this.cachedTools = null;
    // Close any existing transport so we can negotiate a fresh session.
    // The SDK Client throws if asked to connect() while a transport is
    // already attached; close() detaches it cleanly so the same Client
    // instance can be reused.
    if (this.client.transport) {
      this.transport = null;
      try { await this.client.close(); } catch {
        // Closing a transport that may have already failed is best-effort.
      }
    }

    await this.ensureSession();

    if (!this.oauthProvider) {
      const error = 'OAuth provider not initialized';
      this.emitError(error, 'connection');
      this.emitStateChange('FAILED');
      throw new Error(error);
    }

    try {
      this.emitStateChange('CONNECTING');

      /** Use the tryConnect loop to handle transport fallbacks */
      const { transportType } = await this.tryConnect();

      /** Update transport type to the one that actually worked */
      this.config.transportType = transportType;

      this.emitStateChange('CONNECTED');
      this.emitProgress('Connected successfully');

      // Refresh session metadata on every successful connect so active sessions
      // record ongoing usage and don't look dormant to session cleanup jobs.
      this._onObservabilityEvent.fire({
        type: 'mcp:client:session_saved',
        level: 'info',
        message: `Saving active session ${this.config.sessionId} (connect success)`,
        sessionId: this.config.sessionId,
        serverId: this.config.serverId,
        timestamp: Date.now(),
        id: nanoid(),
      });
      await this.saveSession('active');
    } catch (error) {
      /** Handle Authentication Errors */
      if (
        error instanceof SDKUnauthorizedError ||
        (error instanceof Error && error.message.toLowerCase().includes('unauthorized'))
      ) {
        /** Set when the SDK calls redirectToAuthorization on the OAuth provider */
        let authUrl = '';
        if (this.oauthProvider) {
          authUrl = ((this.oauthProvider as any).authUrl || '').trim();
        }
        /**
         * 401 without a usable URL means metadata/DCR failed or the server never started
         * an interactive OAuth flow — not recoverable as "pending OAuth".
         */
        if (!authUrl) {
          const detail =
            error instanceof Error && error.message.trim().length > 0
              ? error.message.trim()
              : 'Unauthorized';
          const message =
            detail.toLowerCase() === 'unauthorized'
              ? 'OAuth authorization URL not available'
              : `OAuth authorization URL not available: ${detail}`;
          this.emitError(message, 'auth');
          this.emitStateChange('FAILED');
          
          // Remove terminal setup failures immediately. Active sessions are not
          // deleted here because this branch only runs before OAuth is available.
          await this.deleteTransientSession();
          
          throw new Error(message);
        }

        this.emitStateChange('AUTHENTICATING');
        this._onObservabilityEvent.fire({
          type: 'mcp:client:session_saved',
          level: 'info',
          message: `Saving pending OAuth session ${this.config.sessionId}`,
          sessionId: this.config.sessionId,
          serverId: this.config.serverId,
          timestamp: Date.now(),
          id: nanoid(),
        });
        await this.saveSession('pending');

        if (this.config.serverId) {
          this._onConnectionEvent.fire({
            type: 'auth_required',
            sessionId: this.config.sessionId,
            serverId: this.config.serverId,
            authUrl,
            timestamp: Date.now(),
          });

          if (authUrl && this.config.onRedirect) {
            this.config.onRedirect(authUrl);
          }
        }

        throw new UnauthorizedError('OAuth authorization required');
      }

      /** Handle Generic Errors */
      const errorMessage = error instanceof Error ? error.message : 'Connection failed';
      this.emitError(errorMessage, 'connection');
      this.emitStateChange('FAILED');

      // Remove transient sessions that failed before becoming restorable.
      // Existing active sessions may still hold usable credentials for reconnect.
      try {
        const existingSession = await this._store.get(this.config.userId, this.config.sessionId);
        if (!existingSession || existingSession.status !== 'active') {
          await this._store.delete(this.config.userId, this.config.sessionId);
        }
      } catch {
        // Best effort only: preserve the original connection error.
      }

      throw error;
    }
  }

  /**
   * Completes OAuth authorization flow by exchanging authorization code for tokens
   * Creates new authenticated client and transport, then establishes connection
   * Saves active session after successful authentication
   * @param authCode - Authorization code received from OAuth callback
   */

  // TODO: needs to be optimized
  async finishAuth(authCode: string, state?: string): Promise<void> {
    this.emitStateChange('AUTHENTICATING');
    this.emitProgress('Exchanging authorization code for tokens...');

    await this.ensureSession();

    if (!this.oauthProvider) {
      const error = 'OAuth provider not initialized';
      this.emitError(error, 'auth');
      this.emitStateChange('FAILED');
      throw new Error(error);
    }

    if (state) {
      try {
        await (this.oauthProvider as AgentsOAuthProvider).consumeState(state);
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Invalid OAuth state';
        this.emitError(msg, 'auth');
        this.emitStateChange('FAILED');
        throw error;
      }
    }

    /**
     * Determine which transports to try for finishing auth
     * If transportType is set, use only that. Otherwise try streamable_http then sse.
     */
    const transportsToTry: TransportType[] = this.config.transportType
      ? [this.config.transportType]
      : ['streamable-http', 'sse'];

    let lastError: unknown;
    let tokensExchanged = false;
    let authenticatedStateEmitted = false;

    for (const currentType of transportsToTry) {
      const isLastAttempt = currentType === transportsToTry[transportsToTry.length - 1];

      try {
        const transport = this.getTransport(currentType);

        /** Update local state with the transport we are about to try */
        this.transport = transport;

        if (!tokensExchanged) {
          await transport.finishAuth(authCode);
          tokensExchanged = true;
        } else {
          this.emitProgress(`Tokens already exchanged, skipping auth step for ${currentType}...`);
        }

        if (!authenticatedStateEmitted) {
          this.emitStateChange('AUTHENTICATED');
          authenticatedStateEmitted = true;
        }

        this.emitStateChange('CONNECTING');

        // The SDK Client may still have a transport attached from a prior
        // connect() that failed with UnauthorizedError; close it first so
        // we can negotiate a fresh session with the newly-exchanged tokens.
        if (this.client.transport) {
          try { await this.client.close(); } catch {}
        }

        await this.client.connect(this.transport);

        /** Capture server metadata from the initialize response */
        this._serverInfo = this.client.getServerVersion();

        /** Connection succeeded — lock in the transport type */
        this.config.transportType = currentType;

        this.emitStateChange('CONNECTED');
        this._onObservabilityEvent.fire({
          type: 'mcp:client:session_saved',
          level: 'info',
          message: `Saving active session ${this.config.sessionId} (OAuth complete)`,
          sessionId: this.config.sessionId,
          serverId: this.config.serverId,
          timestamp: Date.now(),
          id: nanoid(),
        });
        await this.saveSession('active');

        return; // Success, exit function

      } catch (error) {
        lastError = error;

        const isAuthError = error instanceof SDKUnauthorizedError ||
          (error instanceof Error && error.message.toLowerCase().includes('unauthorized'));

        if (isAuthError) {
          throw error;
        }

        const errorMessage = error instanceof Error ? error.message : String(error);

        // Don't retry if the authorization code was rejected (it's one-time use)
        if (!tokensExchanged && errorMessage.toLowerCase().includes('invalid authorization code')) {
          const msg = error instanceof Error ? error.message : 'Authentication failed';
          this.emitError(msg, 'auth');
          this.emitStateChange('FAILED');
          await this.deleteTransientSession();
          throw error;
        }

        if (isLastAttempt) {
          const msg = error instanceof Error ? error.message : 'Authentication failed';
          this.emitError(msg, 'auth');
          this.emitStateChange('FAILED');
          await this.deleteTransientSession();
          throw error;
        }

        // Log and retry
        this.emitProgress(`Auth attempt with ${currentType} failed: ${errorMessage}. Retrying...`);
      }
    }

    if (lastError) {
      const errorMessage = lastError instanceof Error ? lastError.message : 'Authentication failed';
      this.emitError(errorMessage, 'auth');
      this.emitStateChange('FAILED');
      await this.deleteTransientSession();
      throw lastError;
    }
  }

  /**
   * In-memory cache for the remote server's full tools list.
   *
   * Populated on the first `fetchTools()` call and reused for the lifetime of
   * the connection. Cleared to `null` at the start of `connect()` so that a
   * reconnect always retrieves a fresh list, and also in `dispose()` to release
   * the memory when the client is no longer needed.
   */
  private cachedTools: Tool[] | null = null;

  /**
   * Lists all available tools from the connected MCP server without emitting
   * discovery events. The result is cached in memory for the lifetime of the
   * connection — subsequent callers (e.g. `gateway.listTools()` running right
   * after `fetchTools()`) pay zero extra network cost.
   *
   * Gateways use this to apply a tool-access policy before publishing the
   * filtered list to agents or UI state.
   *
   * @returns The full list of tools from the remote server (cached after first call).
   * @throws {Error} When the client is not connected or the request times out.
   */
  async fetchTools(): Promise<Tool[]> {
    if (this.cachedTools) {
      return this.cachedTools;
    }

    let toolsAgg: Tool[] = [];
    let toolsResult: ListToolsResult = { tools: [] };
    do {
      toolsResult = await this.withRetry(() =>
        this.client!.listTools({ cursor: toolsResult.nextCursor }).catch(
          this._capabilityErrorHandler({ tools: [] }, 'tools/list')
        )
      );
      toolsAgg = toolsAgg.concat(toolsResult.tools);
    } while (toolsResult.nextCursor);

    this.cachedTools = toolsAgg;
    return toolsAgg;
  }

  async fetchPrompts(): Promise<Prompt[]> {
    let promptsAgg: Prompt[] = [];
    let promptsResult: ListPromptsResult = { prompts: [] };
    do {
      promptsResult = await this.withRetry(() =>
        this.client!.listPrompts({ cursor: promptsResult.nextCursor }).catch(
          this._capabilityErrorHandler({ prompts: [] }, 'prompts/list')
        )
      );
      promptsAgg = promptsAgg.concat(promptsResult.prompts);
    } while (promptsResult.nextCursor);
    return promptsAgg;
  }

  async fetchResources(): Promise<Resource[]> {
    let resourcesAgg: Resource[] = [];
    let resourcesResult: ListResourcesResult = { resources: [] };
    do {
      resourcesResult = await this.withRetry(() =>
        this.client!.listResources({ cursor: resourcesResult.nextCursor }).catch(
          this._capabilityErrorHandler({ resources: [] }, 'resources/list')
        )
      );
      resourcesAgg = resourcesAgg.concat(resourcesResult.resources);
    } while (resourcesResult.nextCursor);
    return resourcesAgg;
  }

  async fetchResourceTemplates(): Promise<ResourceTemplateType[]> {
    let templatesAgg: ResourceTemplateType[] = [];
    let templatesResult: ListResourceTemplatesResult = {
      resourceTemplates: [],
    };
    do {
      templatesResult = await this.withRetry(() =>
        this.client!.listResourceTemplates({ cursor: templatesResult.nextCursor }).catch(
          this._capabilityErrorHandler({ resourceTemplates: [] }, 'resources/templates/list')
        )
      );
      templatesAgg = templatesAgg.concat(templatesResult.resourceTemplates);
    } while (templatesResult.nextCursor);
    return templatesAgg;
  }

  /**
   * Lists all available tools from the connected MCP server
   * @returns List of tools with their schemas and descriptions
   * @throws {Error} When client is not connected
   */
  async listTools(): Promise<ListToolsResult> {
    this.emitStateChange('DISCOVERING');

    try {
      const tools = await this.fetchTools();

      this.emitStateChange('READY');
      this.emitProgress(`Discovered ${tools.length} tools`);

      return { tools };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to list tools';
      this.emitError(errorMessage, 'validation');
      this.emitStateChange('FAILED');
      throw error;
    }
  }
  /**
   * Executes a tool on the connected MCP server
   * @param toolName - Name of the tool to execute
   * @param toolArgs - Arguments to pass to the tool
   * @returns Tool execution result
   * @throws {Error} When client is not connected
   */
  async callTool(toolName: string, toolArgs: Record<string, unknown>): Promise<CallToolResult> {
    const request: CallToolRequest = {
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: toolArgs,
      },
    };

    try {
      const result = await this.withRetry(() =>
        this.client!.request(request, CallToolResultSchema)
      );

      this._onObservabilityEvent.fire({
        type: 'mcp:client:tool_call',
        level: 'info',
        message: `Tool ${toolName} called successfully`,
        displayMessage: `Called tool ${toolName}`,
        sessionId: this.config.sessionId,
        serverId: this.config.serverId,
        payload: {
          toolName,
          args: toolArgs,
        },
        timestamp: Date.now(),
        id: nanoid(),
      });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : `Failed to call tool ${toolName}`;

      this._onObservabilityEvent.fire({
        type: 'mcp:client:error',
        level: 'error',
        message: errorMessage,
        displayMessage: `Failed to call tool ${toolName}`,
        sessionId: this.config.sessionId,
        serverId: this.config.serverId,
        payload: {
          errorType: 'tool_execution',
          error: errorMessage,
          toolName,
          args: toolArgs,
        },
        timestamp: Date.now(),
        id: nanoid(),
      });

      throw error;
    }
  }

  /**
   * Lists all available prompts from the connected MCP server
   * @returns List of available prompts
   * @throws Error when client is not connected
   */
  async listPrompts(): Promise<ListPromptsResult> {
    this.emitStateChange('DISCOVERING');

    try {
      const prompts = await this.fetchPrompts();

      this.emitStateChange('READY');
      this.emitProgress(`Discovered ${prompts.length} prompts`);

      return { prompts };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to list prompts';
      this.emitError(errorMessage, 'validation');
      this.emitStateChange('FAILED');
      throw error;
    }
  }

  /**
   * Gets a specific prompt with arguments
   * @param name - Name of the prompt
   * @param args - Arguments for the prompt
   * @returns Prompt content
   * @throws {Error} When client is not connected
   */
  async getPrompt(name: string, args?: Record<string, string>): Promise<GetPromptResult> {

    const request: GetPromptRequest = {
      method: 'prompts/get',
      params: {
        name,
        arguments: args,
      },
    };

    return await this.withRetry(() =>
      this.client!.request(request, GetPromptResultSchema)
    );
  }

  /**
   * Lists all available resources from the connected MCP server
   * @returns List of available resources
   * @throws Error when client is not connected
   */
  async listResources(): Promise<ListResourcesResult> {
    this.emitStateChange('DISCOVERING');

    try {
      const resources = await this.fetchResources();

      this.emitStateChange('READY');
      this.emitProgress(`Discovered ${resources.length} resources`);

      return { resources };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to list resources';
      this.emitError(errorMessage, 'validation');
      this.emitStateChange('FAILED');
      throw error;
    }
  }

  /**
   * Lists all available resource templates from the connected MCP server
   * @returns List of available resource templates
   * @throws Error when client is not connected
   */
  async listResourceTemplates(): Promise<ListResourceTemplatesResult> {
    this.emitStateChange('DISCOVERING');

    try {
      const templates = await this.fetchResourceTemplates();

      this.emitStateChange('READY');
      this.emitProgress(`Discovered ${templates.length} resource templates`);

      return { resourceTemplates: templates };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to list resource templates';
      this.emitError(errorMessage, 'validation');
      this.emitStateChange('FAILED');
      throw error;
    }
  }

  /**
   * Discovers all server capabilities (tools, prompts, resources, resource templates)
   * in a single batch operation.
   *
   * Uses the server's `initialize` response to only fetch advertised capabilities.
   * For resumed sessions (no cached capabilities), probes all endpoints.
   * Handles `-32601` (Method not found) gracefully per-endpoint — missing
   * capabilities return empty arrays instead of throwing.
   *
   * Does NOT emit state transitions — the caller is responsible for managing
   * DISCOVERING → READY/FAILED state.
   *
   * @returns All discovered capabilities
   */
  async discoverCapabilities(): Promise<{
    tools: Tool[];
    prompts: Prompt[];
    resources: Resource[];
    resourceTemplates: ResourceTemplateType[];
  }> {
    const caps = this.client.getServerCapabilities();
    const shouldProbe = !caps;

    const [tools, prompts, resources, resourceTemplates] = await Promise.all([
      this.fetchTools(),
      (caps?.prompts || shouldProbe)
        ? this.fetchPrompts()
        : Promise.resolve([] as Prompt[]),
      (caps?.resources || shouldProbe)
        ? this.fetchResources()
        : Promise.resolve([] as Resource[]),
      (caps?.resources || shouldProbe)
        ? this.fetchResourceTemplates()
        : Promise.resolve([] as ResourceTemplateType[]),
    ]);

    return { tools, prompts, resources, resourceTemplates };
  }

  /**
   * Reads a specific resource from the connected MCP server
   * @param uri - The URI of the resource to read
   * @returns The resource content
   * @throws {Error} When client is not connected
   */
  async readResource(uri: string): Promise<ReadResourceResult> {

    const request: ReadResourceRequest = {
      method: 'resources/read',
      params: {
        uri,
      },
    };

    return await this.withRetry(() =>
      this.client!.request(request, ReadResourceResultSchema)
    );
  }

  /**
   * Wraps an MCP request with automatic transport-session recovery.
   *
   * When the downstream MCP server rejects the request with a 404 indicating
   * the transport session has expired, this method tears down the stale SDK
   * client and transport, calls {@link reconnect} to negotiate a fresh session,
   * and retries the request once.
   *
   * Non-transient errors (network failures, auth errors, etc.) propagate as-is.
   */
  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (!(error instanceof Error && error.message.includes('MCP_SESSION_EXPIRED'))) throw error;
      if (this.client.transport) {
        try { await this.client.close(); } catch {}
        this.transport = null;
      }
      await this.reconnect();
      return await fn();
    }
  }

  /**
   * Reconnects to MCP server using existing OAuth provider from session store
   * Used for session restoration in serverless environments
   * Creates new client and transport without re-initializing OAuth provider
   * @throws {Error} When OAuth provider is not initialized
   */
  async reconnect(): Promise<void> {
    await this.ensureSession();
    if (!this.oauthProvider) throw new Error('OAuth provider not initialized');
    await this.connect();
  }

  /**
   * Completely removes the session including all OAuth data
   * Invalidates credentials and disconnects the client
   */
  async clearSession(): Promise<void> {
    try {
      await this.ensureSession();
    } catch (error) {
      this._onObservabilityEvent.fire({
        type: 'mcp:client:error',
        level: 'warn',
        message: 'Initialization failed during clearSession',
        sessionId: this.config.sessionId,
        serverId: this.config.serverId,
        payload: { error: String(error) },
        timestamp: Date.now(),
        id: nanoid(),
      });
    }

    if (this.oauthProvider) {
      await (this.oauthProvider as any).invalidateCredentials('all');
    }

    await this._store.delete(this.config.userId, this.config.sessionId);
    await this.disconnect();
  }

  /**
   * Checks if the client is currently connected to an MCP server
   * @returns True if connected, false otherwise
   */
  isConnected(): boolean {
    return this.client.transport !== undefined;
  }

  /**
   * Disconnects from the MCP server and cleans up resources.
   * Does not remove session — use clearSession() for that.
   *
   * For Streamable HTTP sessions, sends an HTTP DELETE to the MCP endpoint
   * before closing, as recommended by the MCP Streamable HTTP spec
   * (section "Session Management", rule 5). This is best-effort — errors
   * (e.g. server already restarted, 404/405 responses) are silently ignored.
   */
  async disconnect(): Promise<void> {
    // Per the MCP Streamable HTTP spec (2025-11-25), clients SHOULD send an
    // HTTP DELETE with the mcp-session-id header when they no longer need a
    // session. The server MAY respond with 405 if it doesn't support explicit
    // termination — terminateSession() handles that gracefully.
    // SSEClientTransport has no session concept, so we guard with instanceof.
    if (this.transport instanceof StreamableHTTPClientTransport) {
      try {
        await this.transport.terminateSession();
      } catch {
        // Best-effort: server may be unreachable or may have already expired
        // the session. Either way, we proceed with local cleanup.
      }
    }

    if (this.client.transport) {
      try { await this.client.close(); } catch {}
    }
    this.oauthProvider = null;
    this.transport = null;

    // Emit disconnected event
    if (this.config.serverId) {
      this._onConnectionEvent.fire({
        type: 'disconnected',
        sessionId: this.config.sessionId,
        serverId: this.config.serverId,
        timestamp: Date.now(),
      });

      this._onObservabilityEvent.fire({
        type: 'mcp:client:disconnect',
        level: 'info',
        message: `Disconnected from ${this.config.serverId}`,
        sessionId: this.config.sessionId,
        serverId: this.config.serverId,
        payload: {},
        timestamp: Date.now(),
        id: nanoid(),
      });
    }

    this.emitStateChange('DISCONNECTED');
  }

  /**
   * Disposes all event emitters and releases cached state.
   *
   * Clears `cachedTools` to free memory, and disposes the connection and
   * observability event emitters so downstream listeners are unsubscribed.
   * Call this when the client is permanently shut down (not just disconnected).
   */
  dispose(): void {
    this.cachedTools = null;
    this._onConnectionEvent.dispose();
    this._onObservabilityEvent.dispose();
  }

  /**
   * Gets the server URL
   * @returns Server URL or empty string if not set
   */
  getServerUrl(): string {
    return this.config.serverUrl || '';
  }

  /**
   * Gets the OAuth callback URL
   * @returns Callback URL or empty string if not set
   */
  getCallbackUrl(): string {
    return this.config.callbackUrl || '';
  }

  /**
   * Gets the transport type being used
   * @returns Transport type (defaults to 'streamable-http')
   */
  getTransportType(): TransportType {
    return this.config.transportType || 'streamable-http';
  }

  /**
   * Gets the full server metadata from the MCP initialize response.
   * Includes name, version, icons, title, description, and website URL.
   * Returns undefined if the client hasn't connected yet.
   */
  getServerInfo(): Implementation | undefined {
    return this._serverInfo;
  }

  /**
   * Gets the human-readable server name.
   * Prefers the server's reported title/name from the initialize response,
   * falling back to the name provided at construction or session metadata.
   * @returns Server name or undefined
   */
  getServerName(): string | undefined {
    // Temporarily avoid deriving serverName from serverVersion metadata.
    // const info = (this.client as any)?.getServerVersion();
    // return info?.title ?? info?.name ?? this.config.serverName;
    return this.config.serverName;
  }

  /**
   * Gets the server ID
   * @returns Server ID or undefined
   */
  getServerId(): string | undefined {
    return this.config.serverId;
  }

  /**
   * Gets the session ID
   * @returns Session ID
   */
  getSessionId(): string {
    return this.config.sessionId;
  }
}
