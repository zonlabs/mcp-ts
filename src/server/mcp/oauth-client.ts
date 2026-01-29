import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { nanoid } from 'nanoid';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'; /** Import base Transport type */
import {
  UnauthorizedError as SDKUnauthorizedError,
  refreshAuthorization,
  discoverOAuthProtectedResourceMetadata,
  discoverAuthorizationServerMetadata,
  auth
} from '@modelcontextprotocol/sdk/client/auth.js';
import {
  ListToolsRequest,
  ListToolsResult,
  ListToolsResultSchema,
  CallToolRequest,
  CallToolResult,
  CallToolResultSchema,
  ListPromptsRequest,
  ListPromptsResult,
  ListPromptsResultSchema,
  GetPromptRequest,
  GetPromptResult,
  GetPromptResultSchema,
  ListResourcesRequest,
  ListResourcesResult,
  ListResourcesResultSchema,
  ReadResourceRequest,
  ReadResourceResult,
  ReadResourceResultSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type { OAuthClientMetadata, OAuthTokens, OAuthClientInformationFull } from '@modelcontextprotocol/sdk/shared/auth.js';
import { StorageOAuthClientProvider, type AgentsOAuthProvider } from './storage-oauth-provider.js';
import { sanitizeServerLabel } from '../../shared/utils.js';
import { Emitter, type McpConnectionEvent, type McpObservabilityEvent, type McpConnectionState } from '../../shared/events.js';
import { UnauthorizedError } from '../../shared/errors.js';
import { storage } from '../storage/index.js';
import { SESSION_TTL_SECONDS, STATE_EXPIRATION_MS } from '../../shared/constants.js';

/**
 * Supported MCP transport types
 */
export type TransportType = 'sse' | 'streamable_http';

export interface MCPOAuthClientOptions {
  serverUrl?: string;
  serverName?: string;
  callbackUrl?: string;
  onRedirect?: (url: string) => void;
  identity: string;
  serverId?: string; /** Optional - loaded from session if not provided */
  sessionId: string; /** Required - primary key for session lookup */
  transportType?: TransportType;
  tokens?: OAuthTokens;
  tokenExpiresAt?: number;
  clientInformation?: OAuthClientInformationFull;
  clientId?: string;
  clientSecret?: string;
  onSaveTokens?: (tokens: OAuthTokens) => void;
  headers?: Record<string, string>;
  /** OAuth Client Metadata (optional - user application info) */
  clientName?: string;
  clientUri?: string;
  logoUri?: string;
  policyUri?: string;
}

/**
 * MCP Client with OAuth 2.1 authentication support
 * Manages connections to MCP servers with automatic token refresh and session restoration
 * Emits connection lifecycle events for observability
 */
export class MCPClient {
  private client: Client | null = null;
  public oauthProvider: AgentsOAuthProvider | null = null;
  private transport: StreamableHTTPClientTransport | SSEClientTransport | null = null;
  private identity: string;
  private serverId?: string;
  private sessionId: string;
  private serverName?: string;
  private transportType: TransportType | undefined;
  private serverUrl: string | undefined;
  private callbackUrl: string | undefined;
  private onRedirect: ((url: string) => void) | undefined;
  private tokens?: OAuthTokens;
  private tokenExpiresAt?: number;
  private clientInformation?: OAuthClientInformationFull;
  private clientId?: string;
  private clientSecret?: string;
  private onSaveTokens?: (tokens: OAuthTokens) => void;
  private headers?: Record<string, string>;
  /** OAuth Client Metadata */
  private clientName?: string;
  private clientUri?: string;
  private logoUri?: string;
  private policyUri?: string;


  /** Event emitters for connection lifecycle */
  private readonly _onConnectionEvent = new Emitter<McpConnectionEvent>();
  public readonly onConnectionEvent = this._onConnectionEvent.event;

  private readonly _onObservabilityEvent = new Emitter<McpObservabilityEvent>();
  public readonly onObservabilityEvent = this._onObservabilityEvent.event;

  private currentState: McpConnectionState = 'DISCONNECTED';

  /**
   * Creates a new MCP client instance
   * Can be initialized with minimal options (identity + sessionId) for session restoration
   * @param options - Client configuration options
   */
  constructor(options: MCPOAuthClientOptions) {
    this.serverUrl = options.serverUrl;
    this.serverName = options.serverName;
    this.callbackUrl = options.callbackUrl;
    this.onRedirect = options.onRedirect;
    this.identity = options.identity;
    this.serverId = options.serverId;
    this.sessionId = options.sessionId;
    this.transportType = options.transportType;
    this.tokens = options.tokens;
    this.tokenExpiresAt = options.tokenExpiresAt;
    this.clientInformation = options.clientInformation;
    this.clientId = options.clientId;
    this.clientSecret = options.clientSecret;
    this.onSaveTokens = options.onSaveTokens;
    this.headers = options.headers;
    this.clientName = options.clientName;
    this.clientUri = options.clientUri;
    this.logoUri = options.logoUri;
    this.policyUri = options.policyUri;
  }

  /**
   * Emit a connection state change event
   * @private
   */
  private emitStateChange(newState: McpConnectionState): void {
    const previousState = this.currentState;
    this.currentState = newState;

    if (!this.serverId) return;

    this._onConnectionEvent.fire({
      type: 'state_changed',
      sessionId: this.sessionId,
      serverId: this.serverId,
      serverName: this.serverName || this.serverId,
      state: newState,
      previousState,
      timestamp: Date.now(),
    });

    this._onObservabilityEvent.fire({
      type: 'mcp:client:state_change',
      level: 'info',
      message: `Connection state: ${previousState} → ${newState}`,
      displayMessage: `State changed to ${newState}`,
      sessionId: this.sessionId,
      serverId: this.serverId,
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
    if (!this.serverId) return;

    this._onConnectionEvent.fire({
      type: 'error',
      sessionId: this.sessionId,
      serverId: this.serverId,
      error,
      errorType,
      timestamp: Date.now(),
    });

    this._onObservabilityEvent.fire({
      type: 'mcp:client:error',
      level: 'error',
      message: error,
      displayMessage: error,
      sessionId: this.sessionId,
      serverId: this.serverId,
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
    if (!this.serverId) return;

    this._onConnectionEvent.fire({
      type: 'progress',
      sessionId: this.sessionId,
      serverId: this.serverId,
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
    if (!this.serverUrl) {
      throw new Error('Server URL is required to create transport');
    }

    const baseUrl = new URL(this.serverUrl);
    const transportOptions = {
      authProvider: this.oauthProvider!,
      ...(this.headers && { headers: this.headers }),
      /**
       * Custom fetch implementation to handle connection timeouts.
       * Observation: SDK 1.24.0+ connections may hang indefinitely in some environments.
       * This wrapper enforces a timeout and properly uses AbortController to unblock the request.
       */
      fetch: (url: RequestInfo | URL, init?: RequestInit) => {
        const timeout = 30000;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        const signal = init?.signal ?
          // @ts-ignore: AbortSignal.any is available in Node 20+
          (AbortSignal.any ? AbortSignal.any([init.signal, controller.signal]) : controller.signal) :
          controller.signal;

        return fetch(url, { ...init, signal }).finally(() => clearTimeout(timeoutId));
      }
    };

    if (type === 'sse') {
      return new SSEClientTransport(baseUrl, transportOptions);
    } else {
      return new StreamableHTTPClientTransport(baseUrl, transportOptions);
    }
  }

  /**
   * Initializes client components (client, transport, OAuth provider)
   * Loads missing configuration from Redis session store if needed
   * This method is idempotent and safe to call multiple times
   * @private
   */
  private async initialize(): Promise<void> {
    if (this.client && this.oauthProvider) {
      return;
    }

    this.emitStateChange('INITIALIZING');
    this.emitProgress('Loading session configuration...');

    if (!this.serverUrl || !this.callbackUrl || !this.serverId) {
      const sessionData = await storage.getSession(this.identity, this.sessionId);
      if (!sessionData) {
        throw new Error(`Session not found: ${this.sessionId}`);
      }

      this.serverUrl = this.serverUrl || sessionData.serverUrl;
      this.callbackUrl = this.callbackUrl || sessionData.callbackUrl;
      /**
       * Do NOT load transportType from session if not explicitly provided.
       * We want to re-negotiate (try streamable -> sse) on new connections if in "Auto" mode.
       * this.transportType = this.transportType || sessionData.transportType; 
       */
      this.serverName = this.serverName || sessionData.serverName;
      this.serverId = this.serverId || sessionData.serverId || 'unknown';
      this.headers = this.headers || sessionData.headers;
    }

    if (!this.serverUrl || !this.callbackUrl || !this.serverId) {
      throw new Error('Missing required connection metadata');
    }

    const clientMetadata: OAuthClientMetadata = {
      client_name: this.clientName || 'MCP Assistant',
      redirect_uris: [this.callbackUrl],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: this.clientSecret ? 'client_secret_basic' : 'none',
      client_uri: this.clientUri || 'https://mcp-assistant.in',
      logo_uri: this.logoUri || 'https://mcp-assistant.in/logo.png',
      policy_uri: this.policyUri || 'https://mcp-assistant.in/privacy',
      software_id: '@mcp-ts',
      software_version: '1.0.0-beta.4',
      ...(this.clientId ? { client_id: this.clientId } : {}),
      ...(this.clientSecret ? { client_secret: this.clientSecret } : {}),
    };

    if (!this.oauthProvider) {
      if (!this.serverId) {
        throw new Error('serverId required for OAuth provider initialization');
      }

      this.oauthProvider = new StorageOAuthClientProvider(
        this.identity,
        this.serverId,
        this.sessionId,
        clientMetadata.client_name ?? 'MCP Assistant',
        this.callbackUrl,
        (redirectUrl: string) => {
          if (this.onRedirect) {
            this.onRedirect(redirectUrl);
          }
        }
      );

      if (this.clientId && this.oauthProvider) {
        this.oauthProvider.clientId = this.clientId;
      }
    }

    if (!this.client) {
      this.client = new Client(
        {
          name: 'mcp-ts-oauth-client',
          version: '2.0',
        },
        { capabilities: {} }
      );
    }

    // Create session in storage if it doesn't exist yet
    // This is needed BEFORE OAuth flow starts because the OAuth provider
    // will call saveCodeVerifier() which requires the session to exist
    const existingSession = await storage.getSession(this.identity, this.sessionId);
    if (!existingSession && this.serverId && this.serverUrl && this.callbackUrl) {
      console.log(`[MCPClient] Creating initial session ${this.sessionId} for OAuth flow`);
      await storage.createSession({
        sessionId: this.sessionId,
        identity: this.identity,
        serverId: this.serverId,
        serverName: this.serverName,
        serverUrl: this.serverUrl,
        callbackUrl: this.callbackUrl,
        transportType: this.transportType || 'streamable_http',
        createdAt: Date.now(),
      }, Math.floor(STATE_EXPIRATION_MS / 1000)); // Short TTL until connection succeeds
    }
  }

  /**
   * Saves current session state to storage
   * Creates new session if it doesn't exist, updates if it does
   * @param ttl - Time-to-live in seconds (defaults to 12hr for connected sessions)
   * @private
   */
  private async saveSession(ttl: number = SESSION_TTL_SECONDS): Promise<void> {
    if (!this.sessionId || !this.serverId || !this.serverUrl || !this.callbackUrl) {
      return;
    }

    const sessionData = {
      sessionId: this.sessionId,
      identity: this.identity,
      serverId: this.serverId,
      serverName: this.serverName,
      serverUrl: this.serverUrl,
      callbackUrl: this.callbackUrl,
      transportType: this.transportType || 'streamable_http' as TransportType,
      createdAt: Date.now(),
    };

    // Try to update first, create if doesn't exist
    const existingSession = await storage.getSession(this.identity, this.sessionId);
    if (existingSession) {
      await storage.updateSession(this.identity, this.sessionId, sessionData, ttl);
    } else {
      await storage.createSession(sessionData, ttl);
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
    const transportsToTry: TransportType[] = this.transportType
      ? [this.transportType]
      : ['streamable_http', 'sse'];

    let lastError: unknown;

    for (const currentType of transportsToTry) {
      const isLastAttempt = currentType === transportsToTry[transportsToTry.length - 1];

      try {
        const transport = this.getTransport(currentType);

        /** Update local state with the transport we are about to try */
        this.transport = transport;

        /** Race connection against timeout */
        await this.client!.connect(transport);

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
          sessionId: this.sessionId,
          serverId: this.serverId,
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
   * Connects to the MCP server
   * Automatically validates and refreshes OAuth tokens if needed
   * Saves session to Redis on first successful connection
   * @throws {UnauthorizedError} When OAuth authorization is required
   * @throws {Error} When connection fails for other reasons
   */
  async connect(): Promise<void> {
    await this.initialize();

    if (!this.client || !this.oauthProvider) {
      const error = 'Client or OAuth provider not initialized';
      this.emitError(error, 'connection');
      this.emitStateChange('FAILED');
      throw new Error(error);
    }

    try {
      this.emitProgress('Validating OAuth tokens...');
      await this.getValidTokens();

      this.emitStateChange('CONNECTING');

      /** Use the tryConnect loop to handle transport fallbacks */
      const { transportType } = await this.tryConnect();

      /** Update transport type to the one that actually worked */
      this.transportType = transportType;

      this.emitStateChange('CONNECTED');
      this.emitProgress('Connected successfully');

      // Only save/update session if transport type changed (connection negotiation)
      // This avoids unnecessary writes to storage on every connect
      const existingSession = await storage.getSession(this.identity, this.sessionId);
      if (!existingSession || existingSession.transportType !== this.transportType) {
        console.log(`[MCPClient] Saving session ${this.sessionId} (new or transport changed)`);
        await this.saveSession(SESSION_TTL_SECONDS);
      }
    } catch (error) {
      /** Handle Authentication Errors */
      if (
        error instanceof SDKUnauthorizedError ||
        (error instanceof Error && error.message.toLowerCase().includes('unauthorized'))
      ) {
        this.emitStateChange('AUTHENTICATING');
        // Save session with 10min TTL for OAuth pending state
        console.log(`[MCPClient] Saving session ${this.sessionId} with 10min TTL (OAuth pending)`);
        await this.saveSession(Math.floor(STATE_EXPIRATION_MS / 1000));

        /** Get OAuth authorization URL if available */
        let authUrl = '';
        if (this.oauthProvider) {
          authUrl = this.oauthProvider.authUrl || '';
        }

        if (this.serverId) {
          this._onConnectionEvent.fire({
            type: 'auth_required',
            sessionId: this.sessionId,
            serverId: this.serverId,
            authUrl,
            timestamp: Date.now(),
          });

          if (authUrl && this.onRedirect) {
            this.onRedirect(authUrl);
          }
        }

        throw new UnauthorizedError('OAuth authorization required');
      }

      /** Handle Generic Errors */
      const errorMessage = error instanceof Error ? error.message : 'Connection failed';
      this.emitError(errorMessage, 'connection');
      this.emitStateChange('FAILED');
      throw error;
    }
  }

  /**
   * Completes OAuth authorization flow by exchanging authorization code for tokens
   * Creates new authenticated client and transport, then establishes connection
   * Saves active session to Redis after successful authentication
   * @param authCode - Authorization code received from OAuth callback
   */

  // TODO: needs to be optimized
  async finishAuth(authCode: string): Promise<void> {
    this.emitStateChange('AUTHENTICATING');
    this.emitProgress('Exchanging authorization code for tokens...');

    await this.initialize();

    if (!this.oauthProvider) {
      const error = 'OAuth provider not initialized';
      this.emitError(error, 'auth');
      this.emitStateChange('FAILED');
      throw new Error(error);
    }

    /**
     * Determine which transports to try for finishing auth
     * If transportType is set, use only that. Otherwise try streamable_http then sse.
     */
    const transportsToTry: TransportType[] = this.transportType
      ? [this.transportType]
      : ['streamable_http', 'sse'];

    let lastError: unknown;
    let tokensExchanged = false;

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

        /** Success! Update transport type */
        this.transportType = currentType;

        this.emitStateChange('AUTHENTICATED');
        this.emitProgress('Creating authenticated client...');

        this.client = new Client(
          {
            name: 'mcp-ts-oauth-client',
            version: '2.0',
          },
          { capabilities: {} }
        );

        this.emitStateChange('CONNECTING');

        /** We explicitly try to connect with the transport we just auth'd with first */
        await this.client.connect(this.transport);

        this.emitStateChange('CONNECTED');
        // Update session with 12hr TTL after successful OAuth
        console.log(`[MCPClient] Updating session ${this.sessionId} to 12hr TTL (OAuth complete)`);
        await this.saveSession(SESSION_TTL_SECONDS);

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
          throw error;
        }

        if (isLastAttempt) {
          const msg = error instanceof Error ? error.message : 'Authentication failed';
          this.emitError(msg, 'auth');
          this.emitStateChange('FAILED');
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
      throw lastError;
    }
  }

  /**
   * Lists all available tools from the connected MCP server
   * @returns List of tools with their schemas and descriptions
   * @throws {Error} When client is not connected
   */
  async listTools(): Promise<ListToolsResult> {
    if (!this.client) {
      throw new Error('Not connected to server');
    }

    this.emitStateChange('DISCOVERING');

    try {
      const request: ListToolsRequest = {
        method: 'tools/list',
        params: {},
      };

      const result = await this.client.request(request, ListToolsResultSchema);

      if (this.serverId) {
        this._onConnectionEvent.fire({
          type: 'tools_discovered',
          sessionId: this.sessionId,
          serverId: this.serverId,
          toolCount: result.tools.length,
          tools: result.tools,
          timestamp: Date.now(),
        });
      }

      this.emitStateChange('READY');
      this.emitProgress(`Discovered ${result.tools.length} tools`);

      return result;
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
    if (!this.client) {
      throw new Error('Not connected to server');
    }

    const request: CallToolRequest = {
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: toolArgs,
      },
    };

    try {
      const result = await this.client.request(request, CallToolResultSchema);

      this._onObservabilityEvent.fire({
        type: 'mcp:client:tool_call',
        level: 'info',
        message: `Tool ${toolName} called successfully`,
        displayMessage: `Called tool ${toolName}`,
        sessionId: this.sessionId,
        serverId: this.serverId,
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
        sessionId: this.sessionId,
        serverId: this.serverId,
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
   * @throws {Error} When client is not connected
   */
  async listPrompts(): Promise<ListPromptsResult> {
    if (!this.client) {
      throw new Error('Not connected to server');
    }

    this.emitStateChange('DISCOVERING');

    try {
      const request: ListPromptsRequest = {
        method: 'prompts/list',
        params: {},
      };

      const result = await this.client.request(request, ListPromptsResultSchema);

      this.emitStateChange('READY');
      this.emitProgress(`Discovered ${result.prompts.length} prompts`);

      return result;
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
    if (!this.client) {
      throw new Error('Not connected to server');
    }

    const request: GetPromptRequest = {
      method: 'prompts/get',
      params: {
        name,
        arguments: args,
      },
    };

    return await this.client.request(request, GetPromptResultSchema);
  }

  /**
   * Lists all available resources from the connected MCP server
   * @returns List of available resources
   * @throws {Error} When client is not connected
   */
  async listResources(): Promise<ListResourcesResult> {
    if (!this.client) {
      throw new Error('Not connected to server');
    }

    this.emitStateChange('DISCOVERING');

    try {
      const request: ListResourcesRequest = {
        method: 'resources/list',
        params: {},
      };

      const result = await this.client.request(request, ListResourcesResultSchema);

      this.emitStateChange('READY');
      this.emitProgress(`Discovered ${result.resources.length} resources`);

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to list resources';
      this.emitError(errorMessage, 'validation');
      this.emitStateChange('FAILED');
      throw error;
    }
  }

  /**
   * Reads a specific resource
   * @param uri - URI of the resource to read
   * @returns Resource content
   * @throws {Error} When client is not connected
   */
  async readResource(uri: string): Promise<ReadResourceResult> {
    if (!this.client) {
      throw new Error('Not connected to server');
    }

    const request: ReadResourceRequest = {
      method: 'resources/read',
      params: {
        uri,
      },
    };

    return await this.client.request(request, ReadResourceResultSchema);
  }

  /**
   * Refreshes the OAuth access token using the refresh token
   * Discovers OAuth metadata from server and exchanges refresh token for new access token
   * @returns True if refresh was successful, false otherwise
   */
  async refreshToken(): Promise<boolean> {
    await this.initialize();

    if (!this.oauthProvider) {
      return false;
    }

    const tokens = await this.oauthProvider.tokens();
    if (!tokens || !tokens.refresh_token) {
      return false;
    }

    const clientInformation = await this.oauthProvider.clientInformation();
    if (!clientInformation) {
      return false;
    }

    try {
      const resourceMetadata = await discoverOAuthProtectedResourceMetadata(this.serverUrl!);
      const authServerUrl = resourceMetadata?.authorization_servers?.[0] || this.serverUrl!;
      const authMetadata = await discoverAuthorizationServerMetadata(authServerUrl);

      const newTokens = await refreshAuthorization(authServerUrl, {
        metadata: authMetadata,
        clientInformation,
        refreshToken: tokens.refresh_token,
      });

      await this.oauthProvider.saveTokens(newTokens);
      return true;
    } catch (error) {
      console.error('[OAuth] Token refresh failed:', error);
      return false;
    }
  }

  /**
   * Ensures OAuth tokens are valid, refreshing them if expired
   * Called automatically by connect() - rarely needs to be called manually
   * @returns True if valid tokens are available, false otherwise
   */
  async getValidTokens(): Promise<boolean> {
    await this.initialize();

    if (!this.oauthProvider) {
      return false;
    }

    const tokens = await this.oauthProvider.tokens();
    if (!tokens) {
      return false;
    }

    if (this.oauthProvider.isTokenExpired()) {
      return await this.refreshToken();
    }

    return true;
  }

  /**
   * Reconnects to MCP server using existing OAuth provider from Redis
   * Used for session restoration in serverless environments
   * Creates new client and transport without re-initializing OAuth provider
   * @throws {Error} When OAuth provider is not initialized
   */
  async reconnect(): Promise<void> {
    await this.initialize();

    if (!this.oauthProvider) {
      throw new Error('OAuth provider not initialized');
    }

    this.client = new Client(
      {
        name: 'mcp-ts-oauth-client',
        version: '2.0',
      },
      { capabilities: {} }
    );

    // Use default logic to get transport, defaulting to what's stored or auto
    const tt = this.transportType || 'streamable_http';
    this.transport = this.getTransport(tt);

    await this.client.connect(this.transport);
  }

  /**
   * Completely removes the session from Redis including all OAuth data
   * Invalidates credentials and disconnects the client
   */
  async clearSession(): Promise<void> {
    try {
      await this.initialize();
    } catch (error) {
      console.warn('[MCPClient] Initialization failed during clearSession:', error);
    }

    if (this.oauthProvider) {
      await (this.oauthProvider as any).invalidateCredentials('all');
    }

    await storage.removeSession(this.identity, this.sessionId);
    this.disconnect();
  }

  /**
   * Checks if the client is currently connected to an MCP server
   * @returns True if connected, false otherwise
   */
  isConnected(): boolean {
    return this.client !== null;
  }

  /**
   * Disconnects from the MCP server and cleans up resources
   * Does not remove session from Redis - use clearSession() for that
   */
  disconnect(reason?: string): void {
    if (this.client) {
      this.client.close();
    }
    this.client = null;
    this.oauthProvider = null;
    this.transport = null;

    // Emit disconnected event
    if (this.serverId) {
      this._onConnectionEvent.fire({
        type: 'disconnected',
        sessionId: this.sessionId,
        serverId: this.serverId,
        reason,
        timestamp: Date.now(),
      });

      this._onObservabilityEvent.fire({
        type: 'mcp:client:disconnect',
        level: 'info',
        message: `Disconnected from ${this.serverId}`,
        sessionId: this.sessionId,
        serverId: this.serverId,
        payload: {
          reason: reason || 'unknown',
        },
        timestamp: Date.now(),
        id: nanoid(),
      });
    }

    this.emitStateChange('DISCONNECTED');
  }

  /**
   * Dispose of all event emitters
   * Call this when the client is no longer needed
   */
  dispose(): void {
    this._onConnectionEvent.dispose();
    this._onObservabilityEvent.dispose();
  }

  /**
   * Gets the server URL
   * @returns Server URL or empty string if not set
   */
  getServerUrl(): string {
    return this.serverUrl || '';
  }

  /**
   * Gets the OAuth callback URL
   * @returns Callback URL or empty string if not set
   */
  getCallbackUrl(): string {
    return this.callbackUrl || '';
  }

  /**
   * Gets the transport type being used
   * @returns Transport type (defaults to 'streamable_http')
   */
  getTransportType(): TransportType {
    return this.transportType || 'streamable_http';
  }

  /**
   * Gets the human-readable server name
   * @returns Server name or undefined
   */
  getServerName(): string | undefined {
    return this.serverName;
  }

  /**
   * Gets the server ID
   * @returns Server ID or undefined
   */
  getServerId(): string | undefined {
    return this.serverId;
  }

  /**
   * Gets the session ID
   * @returns Session ID
   */
  getSessionId(): string {
    return this.sessionId;
  }

  /**
   * Gets MCP server configuration for all active user sessions
   * Loads sessions from Redis, validates OAuth tokens, refreshes if expired
   * Returns ready-to-use configuration with valid auth headers
   * @param identity - User ID to fetch sessions for
   * @returns Object keyed by sanitized server labels containing transport, url, headers, etc.
   * @static
   */
  static async getMcpServerConfig(identity: string): Promise<Record<string, any>> {
    const mcpConfig: Record<string, any> = {};
    const sessions = await storage.getIdentitySessionsData(identity);

    await Promise.all(
      sessions.map(async (sessionData) => {
        const { sessionId } = sessionData;

        try {
          // Validate session - remove if missing required fields
          if (
            !sessionData.serverId ||
            !sessionData.transportType ||
            !sessionData.serverUrl ||
            !sessionData.callbackUrl
          ) {
            await storage.removeSession(identity, sessionId);
            return;
          }

          // Get OAuth headers if session requires authentication
          let headers: Record<string, string> | undefined;
          try {
            // Inject existing session data to avoid redundant storage reads in initialize()
            const client = new MCPClient({
              identity,
              sessionId,
              serverId: sessionData.serverId,
              serverUrl: sessionData.serverUrl,
              callbackUrl: sessionData.callbackUrl,
              serverName: sessionData.serverName,
              transportType: sessionData.transportType,
              headers: sessionData.headers,
            });

            await client.initialize();

            const hasValidTokens = await client.getValidTokens();
            if (hasValidTokens && client.oauthProvider) {
              const tokens = await client.oauthProvider.tokens();
              if (tokens?.access_token) {
                headers = { Authorization: `Bearer ${tokens.access_token}` };
              }
            }
          } catch (error) {
            console.warn(`[MCP] Failed to get OAuth tokens for ${sessionId}:`, error);
          }

          // Build server config
          const label = sanitizeServerLabel(
            sessionData.serverName || sessionData.serverId || 'server'
          );

          mcpConfig[label] = {
            transport: sessionData.transportType,
            url: sessionData.serverUrl,
            ...(sessionData.serverName && {
              serverName: sessionData.serverName,
              serverLabel: label,
            }),
            ...(headers && { headers }),
          };
        } catch (error) {
          await storage.removeSession(identity, sessionId);
          console.warn(`[MCP] Failed to process session ${sessionId}:`, error);
        }
      })
    );

    return mcpConfig;
  }

}

