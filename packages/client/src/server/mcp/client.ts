import { Client, StreamableHTTPClientTransport, SSEClientTransport, UnauthorizedError as SDKUnauthorizedError, ProtocolError, ListToolsResult, CallToolRequest, CallToolResult, ListPromptsResult, GetPromptRequest, GetPromptResult, ListResourcesResult, ListResourceTemplatesResult, ReadResourceRequest, ReadResourceResult } from "@modelcontextprotocol/client";
import type { Tool, Prompt, Resource, ResourceTemplateType, Implementation, OAuthTokens, OAuthClientProvider, StoredOAuthClientInformation, OAuthClientInformationMixed, ClientOptions, DiscoverResult, ListChangedHandlers, McpSubscription, ProtocolEra } from "@modelcontextprotocol/client";
import { nanoid } from 'nanoid';
import { StorageOAuthClientProvider, type AgentsOAuthProvider } from './storage-oauth-provider.js';
import { isTransportNotImplemented } from './errors.js';
import { Emitter, type McpConnectionEvent, type McpObservabilityEvent, type McpConnectionState } from '../../shared/events.js';
import { UnauthorizedError } from '../../shared/errors.js';
import { sessions } from '../storage/index.js';
import type { Session, SessionStatus, SessionStore, StoredMcpSdkClientOptions, StoredMcpTransportOptions, StoredMcpServerOptions } from '../storage/types.js';
import {
  MCP_CLIENT_NAME,
  MCP_CLIENT_VERSION,
} from '../../shared/constants.js';
/**
 * Supported MCP transport types
 */
export type TransportType = 'sse' | 'streamable-http';

export type McpSdkClientOptions = Pick<
  ClientOptions,
  | 'capabilities'
  | 'versionNegotiation'
  | 'inputRequired'
  | 'supportedProtocolVersions'
  | 'enforceStrictCapabilities'
  | 'listChanged'
  | 'listMaxPages'
  | 'responseCacheStore'
  | 'cachePartition'
  | 'defaultCacheTtlMs'
>;

export function normalizeMcpSdkClientOptions(options?: McpSdkClientOptions): McpSdkClientOptions {
  return {
    ...options,
    versionNegotiation: {
      mode: 'auto',
      ...options?.versionNegotiation,
    },
  };
}
export function toStoredMcpSdkClientOptions(options?: McpSdkClientOptions): StoredMcpSdkClientOptions | undefined {
  if (!options) return undefined;
  const stored: StoredMcpSdkClientOptions = {
    capabilities: options.capabilities,
    versionNegotiation: options.versionNegotiation,
    inputRequired: options.inputRequired,
    supportedProtocolVersions: options.supportedProtocolVersions,
    enforceStrictCapabilities: options.enforceStrictCapabilities,
    listMaxPages: options.listMaxPages,
    cachePartition: options.cachePartition,
    defaultCacheTtlMs: options.defaultCacheTtlMs,
  };

  return Object.fromEntries(
    Object.entries(stored).filter(([, value]) => value !== undefined)
  ) as StoredMcpSdkClientOptions;
}

function mergeMcpSdkClientOptions(
  persisted?: StoredMcpSdkClientOptions | null,
  override?: McpSdkClientOptions,
): McpSdkClientOptions | undefined {
  if (!persisted && !override) return undefined;

  const extensions = {
    ...persisted?.capabilities?.extensions,
    ...override?.capabilities?.extensions,
  };
  const capabilities = persisted?.capabilities || override?.capabilities
    ? {
        ...persisted?.capabilities,
        ...override?.capabilities,
      }
    : undefined;

  if (capabilities && Object.keys(extensions).length > 0) {
    capabilities.extensions = extensions;
  }

  return {
    ...persisted,
    ...override,
    versionNegotiation: persisted?.versionNegotiation || override?.versionNegotiation
      ? {
          ...persisted?.versionNegotiation,
          ...override?.versionNegotiation,
        }
      : undefined,
    capabilities,
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
  transport?: StoredMcpTransportOptions | null;
  headers?: Record<string, string>;
  /** OAuth Client Metadata (optional - user application info) */
  clientName?: string;
  clientUri?: string;
  logoUri?: string;
  policyUri?: string;
  clientInformation?: StoredOAuthClientInformation | OAuthClientInformationMixed;
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
  /**
   * Custom OAuthClientProvider override (e.g. Cloudflare AgentMcpOAuthProvider or custom provider).
   */
  oauthProvider?: OAuthClientProvider;
  /** MCP SDK v2 client options forwarded to @modelcontextprotocol/client. */
  client?: McpSdkClientOptions;
  /** Persisted Cloudflare-style server options loaded from session storage. */
  serverOptions?: StoredMcpServerOptions | null;
  /** Persisted server/discover result used for v2 restore optimization. */
  discoverResult?: DiscoverResult | null;
  /**
   * Arbitrary caller-supplied key-value pairs stored alongside the session.
   * The library stores this opaquely and never reads or interprets it.
   * Use it to attach your own reference IDs (e.g. a catalog server ID, tenant ID, etc.).
   */
  metadata?: Record<string, string>;
}

export type McpClientOptions = MCPOAuthClientOptions;

export type McpListType = 'tools' | 'prompts' | 'resources';

export interface McpListChangedEvent {
  listType: McpListType;
  error: Error | null;
}

/**
 * MCP client with OAuth 2.1 (PKCE & DCR) lifecycle support.
 * Handles SSE and Streamable HTTP transports, session durability,
 * automatic token refresh, and real-time observability.
 *
 * @example
 * ```ts
 * const client = new McpClient({
 *   serverUrl: "https://mcp.tavily.com/mcp",
 *   userId: "user_123",
 *   sessionId: "sess_tavily",
 * });
 * await client.connect();
 * const { tools } = await client.listTools();
 * ```
 */
export class McpClient {
  private client: Client;
  public oauthProvider: OAuthClientProvider | null = null;
  private transport: StreamableHTTPClientTransport | SSEClientTransport | null = null;
  private config!: MCPOAuthClientOptions;
  private createdAt?: number;
  private _serverInfo: Implementation | undefined;
  private _negotiatedProtocolVersion: string | undefined;
  private _protocolEra: ProtocolEra | undefined;
  private _discoverResult: DiscoverResult | undefined;
  private _restoredListSubscription: McpSubscription | undefined;
  private _store!: SessionStore;

  /** Event emitters for connection lifecycle */
  private readonly _onConnectionEvent = new Emitter<McpConnectionEvent>();
  public readonly onConnectionEvent = this._onConnectionEvent.event;

  private readonly _onListChanged = new Emitter<McpListChangedEvent>();
  public readonly onListChanged = this._onListChanged.event;

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
    if (options.oauthProvider) {
      this.oauthProvider = options.oauthProvider;
    }

    this.client = this.createSdkClient();
  }

  private createSdkClient(): Client {
    const options = normalizeMcpSdkClientOptions(this.config.client);
    const configuredListChanged = options.listChanged;
    const listChanged: ListChangedHandlers = {
      tools: {
        ...configuredListChanged?.tools,
        onChanged: (error, tools) => {
          if (!error && tools) this.cachedTools = tools;
          this._onListChanged.fire({ listType: 'tools', error });
          configuredListChanged?.tools?.onChanged(error, tools);
        },
      },
      prompts: {
        ...configuredListChanged?.prompts,
        onChanged: (error, prompts) => {
          if (!error && prompts) this.cachedPrompts = prompts;
          this._onListChanged.fire({ listType: 'prompts', error });
          configuredListChanged?.prompts?.onChanged(error, prompts);
        },
      },
      resources: {
        ...configuredListChanged?.resources,
        onChanged: (error, resources) => {
          if (!error && resources) this.cachedResources = resources;
          // MCP uses the resources list-change notification for both concrete
          // resources and resource templates.
          this.cachedResourceTemplates = null;
          this._onListChanged.fire({ listType: 'resources', error });
          configuredListChanged?.resources?.onChanged(error, resources);
        },
      },
    };

    return new Client(
      {
        name: MCP_CLIENT_NAME,
        version: MCP_CLIENT_VERSION,
      },
      {
        ...options,
        listChanged,
      },
    );
  }

  private captureConnectionMetadata(): void {
    this._serverInfo = this.client.getServerVersion();
    this._negotiatedProtocolVersion = this.client.getNegotiatedProtocolVersion();
    this._protocolEra = this.client.getProtocolEra();
    this._discoverResult = this.client.getDiscoverResult();
  }

  private getConfiguredTransportType(): TransportType {
    return (this.config.transport?.type ?? this.config.serverOptions?.transport?.type ?? 'streamable-http') as TransportType;
  }

  private getStoredServerOptions(): StoredMcpServerOptions {
    return {
      client: toStoredMcpSdkClientOptions(this.config.client),
      transport: {
        ...(this.config.transport ?? {}),
        type: this.getConfiguredTransportType(),
        protocolVersion: this._negotiatedProtocolVersion ?? this.config.transport?.protocolVersion,
      },
      discoverResult: this._discoverResult ?? this.config.discoverResult ?? undefined,
    };
  }
  private getConnectOptions(): { prior: { kind: 'modern'; discover: DiscoverResult } } | undefined {
    const discoverResult = this.config.discoverResult ?? this.config.serverOptions?.discoverResult;
    if (discoverResult) {
      return { prior: { kind: 'modern', discover: discoverResult } };
    }
    return undefined;
  }

  private async openRestoredListSubscription(): Promise<void> {
    const capabilities = this.client.getServerCapabilities();
    const filter = {
      ...(capabilities?.tools?.listChanged && { toolsListChanged: true }),
      ...(capabilities?.prompts?.listChanged && { promptsListChanged: true }),
      ...(capabilities?.resources?.listChanged && { resourcesListChanged: true }),
    };
    if (Object.keys(filter).length === 0) return;

    try {
      this._restoredListSubscription = await this.client.listen(filter);
    } catch (error) {
      this.client.onerror?.(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  private async closeRestoredListSubscription(): Promise<void> {
    const subscription = this._restoredListSubscription;
    this._restoredListSubscription = undefined;
    await subscription?.close().catch(() => {});
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
      serverOptions: this.getStoredServerOptions(),
      headers: this.config.headers,
      createdAt: this.createdAt ?? Date.now(),
      updatedAt: Date.now(),
      metadata: this.config.metadata,
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
   * Rebuilds the SDK Client when persisted serverOptions.client values are loaded during restoration.
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
      const storedOptions = existingSession.serverOptions ?? this.config.serverOptions ?? undefined;
      this.config.transport = this.config.transport ?? storedOptions?.transport;
      this.config.discoverResult = this.config.discoverResult ?? storedOptions?.discoverResult ?? undefined;
      const previousClientOptions = this.config.client;
      this.config.client = mergeMcpSdkClientOptions(storedOptions?.client, this.config.client);
      if (!previousClientOptions && this.config.client && !this.client.transport) {
        this.client = this.createSdkClient();
      }
      this.createdAt = existingSession.createdAt;
    }

    if (!this.config.serverUrl || !this.config.callbackUrl || !this.config.serverId) {
      throw new Error('Missing required connection metadata');
    }

    this.oauthProvider = this.config.oauthProvider ?? new StorageOAuthClientProvider({
      userId: this.config.userId,
      serverId: this.config.serverId!,
      sessionId: this.config.sessionId,
      redirectUrl: this.config.callbackUrl!,
      clientName: this.config.clientName,
      clientUri: this.config.clientUri,
      logoUri: this.config.logoUri,
      policyUri: this.config.policyUri,
      clientInformation: this.config.clientInformation,
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

    if (this.config.clientInformation?.client_id && this.oauthProvider?.saveClientInformation) {
      await this.oauthProvider.saveClientInformation(
        this.config.clientInformation as StoredOAuthClientInformation
      );
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

    if (this.config.hasSession) {
      if (status === 'active') {
        const storedOptions = this.getStoredServerOptions();
        const currentOptions = this.config.serverOptions;
        const unchanged =
          currentOptions &&
          storedOptions.transport?.type === currentOptions.transport?.type &&
          storedOptions.transport?.protocolVersion === currentOptions.transport?.protocolVersion &&
          JSON.stringify(storedOptions.discoverResult ?? null) === JSON.stringify(currentOptions.discoverResult ?? null);
        if (unchanged) {
          return;
        }
      }
      await this._store.update(this.config.userId, this.config.sessionId, {
        ...this.session,
        status,
      });
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
   * Connects using the configured transport with automatic fallback (Streamable HTTP -> SSE).
   * @returns The transport type that successfully connected.
   * @private
   */
  private async tryConnect(): Promise<{ transport: TransportType }> {
    const currentType = this.getConfiguredTransportType();
    const transport = this.getTransport(currentType);
    this.transport = transport;

    try {
      const connectOptions = this.getConnectOptions();
      await this.client.connect(transport, connectOptions);
      this.captureConnectionMetadata();
      if (connectOptions?.prior.kind === 'modern') {
        await this.openRestoredListSubscription();
      }
      return { transport: currentType };
    } catch (connectError) {
      if (currentType === 'streamable-http' && isTransportNotImplemented(connectError)) {
        if (this.client.transport) {
          try { await this.client.close(); } catch {}
        }
        const sseTransport = this.getTransport('sse');
        this.transport = sseTransport;
        const connectOptions = this.getConnectOptions();
        await this.client.connect(sseTransport, connectOptions);
        this.captureConnectionMetadata();
        if (connectOptions?.prior.kind === 'modern') {
          await this.openRestoredListSubscription();
        }
        return { transport: 'sse' };
      }
      throw connectError;
    }
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
    this.clearCatalogCaches();
    await this.closeRestoredListSubscription();
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

      /** Connect using the configured transport. */
      const { transport } = await this.tryConnect();

      /** Update transport options to the one that actually worked. */
      this.config.transport = { ...(this.config.transport ?? {}), type: transport };

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
      /** Handle 401 Unauthorized / OAuth Redirect */
      if (
        error instanceof UnauthorizedError ||
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
   *
   * @param authCode - Authorization code received from OAuth callback
   * @param state - Optional OAuth state parameter for state consumption and validation
   * @param iss - Optional RFC 9207 issuer identifier received from OAuth callback
   */
  async finishAuth(authCode: string, state?: string, iss?: string): Promise<void> {
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

    const currentType = this.getConfiguredTransportType();

    try {
      const discovery = await this.oauthProvider.discoveryState?.();
      const expectedIssuer = discovery?.authorizationServerMetadata?.issuer ?? discovery?.authorizationServerUrl;
      const effectiveIss = iss ?? expectedIssuer;

      // Finish auth on the active transport (preserving WWW-Authenticate challenge metadata)
      // or instantiate a fresh transport if none was previously initialized.
      const authTransport = this.transport ?? this.getTransport(currentType);
      await (authTransport as any).finishAuth(authCode, effectiveIss);
      
      this.emitStateChange('AUTHENTICATED');
      this.emitStateChange('CONNECTING');

      // Detach any prior unauthenticated transport from the SDK Client
      if (this.client.transport) {
        try { await this.client.close(); } catch {}
      }

      const { transport } = await this.tryConnect();
      this.config.transport = { ...(this.config.transport ?? {}), type: transport };

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
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Authentication failed';
      this.emitError(msg, 'auth');
      this.emitStateChange('FAILED');
      await this.deleteTransientSession();
      throw error;
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
  private cachedPrompts: Prompt[] | null = null;
  private cachedResources: Resource[] | null = null;
  private cachedResourceTemplates: ResourceTemplateType[] | null = null;

  private clearCatalogCaches(): void {
    this.cachedTools = null;
    this.cachedPrompts = null;
    this.cachedResources = null;
    this.cachedResourceTemplates = null;
  }

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
    if (this.cachedPrompts) {
      return this.cachedPrompts;
    }

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
    this.cachedPrompts = promptsAgg;
    return promptsAgg;
  }

  async fetchResources(): Promise<Resource[]> {
    if (this.cachedResources) {
      return this.cachedResources;
    }

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
    this.cachedResources = resourcesAgg;
    return resourcesAgg;
  }

  async fetchResourceTemplates(): Promise<ResourceTemplateType[]> {
    if (this.cachedResourceTemplates) {
      return this.cachedResourceTemplates;
    }

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
    this.cachedResourceTemplates = templatesAgg;
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
        this.client!.callTool(request.params)
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
      this.client!.request(request) as Promise<GetPromptResult>
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
      this.client!.request(request) as Promise<ReadResourceResult>
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
    await this.closeRestoredListSubscription();

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
    void this.closeRestoredListSubscription();
    this.clearCatalogCaches();
    this._onListChanged.dispose();
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
    return this.getConfiguredTransportType();
  }

  /**
   * Gets the full server metadata from the MCP initialize response.
   * Includes name, version, icons, title, description, and website URL.
   * Returns undefined if the client hasn't connected yet.
   */
  getServerInfo(): Implementation | undefined {
    return this._serverInfo;
  }
  /** Gets the MCP protocol version negotiated by the SDK connection. */
  getNegotiatedProtocolVersion(): string | undefined {
    return this._negotiatedProtocolVersion;
  }

  /** Gets whether the client connected via the legacy initialize era or discover era. */
  getProtocolEra(): ProtocolEra | undefined {
    return this._protocolEra;
  }

  /** Gets the in-memory server/discover result from the SDK connection, when available. */
  getDiscoverResult(): DiscoverResult | undefined {
    return this._discoverResult;
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
