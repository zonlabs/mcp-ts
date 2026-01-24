import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { nanoid } from 'nanoid';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
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
import { RedisOAuthClientProvider, type AgentsOAuthProvider } from './redis-oauth-client-provider.js';
import { sanitizeServerLabel } from '../shared/utils.js';
import { Emitter, type McpConnectionEvent, type McpObservabilityEvent, type McpConnectionState } from '../shared/events.js';
import { UnauthorizedError } from '../shared/errors.js';
import { sessionStore } from './session-store.js';

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
  serverId?: string; // Optional - loaded from session if not provided
  sessionId: string; // Required - primary key for session lookup
  transportType?: TransportType;
  tokens?: OAuthTokens;
  tokenExpiresAt?: number;
  clientInformation?: OAuthClientInformationFull;
  clientId?: string;
  clientSecret?: string;
  onSaveTokens?: (tokens: OAuthTokens) => void;
  headers?: Record<string, string>;
  // OAuth Client Metadata (optional - user application info)
  clientName?: string;
  clientUri?: string;
  logoUri?: string;
  policyUri?: string;
}

/**
 * MCP Client with OAuth 2.0 authentication support
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
  // OAuth Client Metadata
  private clientName?: string;
  private clientUri?: string;
  private logoUri?: string;
  private policyUri?: string;

  // Event emitters for connection lifecycle
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

    this._onObservabilityEvent.fire({
      type: 'mcp:client:trace',
      level: 'debug',
      message,
      displayMessage: message,
      sessionId: this.sessionId,
      serverId: this.serverId,
      timestamp: Date.now(),
      id: nanoid(),
    });
  }

  /**
   * Get current connection state
   */
  getConnectionState(): McpConnectionState {
    return this.currentState;
  }

  /**
   * Initializes client components (client, transport, OAuth provider)
   * Loads missing configuration from Redis session store if needed
   * This method is idempotent and safe to call multiple times
   * @private
   */
  private async initialize(): Promise<void> {
    if (this.client && this.oauthProvider && this.transport) {
      this.emitProgress('Client already initialized, skipping...');
      return;
    }

    this.emitStateChange('INITIALIZING');
    this.emitProgress('Loading session configuration...');

    if (!this.serverUrl || !this.callbackUrl || !this.serverId) {
      this.emitProgress('Loading configuration from Redis...');
      const sessionData = await sessionStore.getSession(this.identity, this.sessionId);
      if (!sessionData) {
        throw new Error(`Session not found: ${this.sessionId}`);
      }

      this.serverUrl = this.serverUrl || sessionData.serverUrl;
      this.callbackUrl = this.callbackUrl || sessionData.callbackUrl;
      this.transportType = this.transportType || sessionData.transportType;
      this.serverName = this.serverName || sessionData.serverName;
      this.serverId = this.serverId || sessionData.serverId || 'unknown';
      this.headers = this.headers || sessionData.headers;

      this.emitProgress(`Loaded config - Server: ${this.serverUrl}, Transport: ${this.transportType}`);
    }

    if (!this.serverUrl || !this.callbackUrl || !this.serverId) {
      throw new Error('Missing required connection metadata');
    }

    this._onObservabilityEvent.fire({
      level: 'debug',
      message: 'Connection configuration',
      sessionId: this.sessionId,
      serverId: this.serverId,
      metadata: {
        serverUrl: this.serverUrl,
        callbackUrl: this.callbackUrl,
        transportType: this.transportType,
        hasHeaders: !!this.headers,
        headers: this.headers,
      },
      timestamp: Date.now(),
    });

    const clientMetadata: OAuthClientMetadata = {
      client_name: this.clientName || 'MCP Assistant',
      redirect_uris: [this.callbackUrl],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'client_secret_basic',
      client_uri: this.clientUri || 'https://mcp-assistant.in',
      logo_uri: this.logoUri || 'https://mcp-assistant.in/logo.png',
      policy_uri: this.policyUri || 'https://mcp-assistant.in/privacy',
      software_id: '@mcp-ts/redis',
      software_version: '1.0.0-beta.4',
      ...(this.clientId ? { client_id: this.clientId } : {}),
      ...(this.clientSecret ? { client_secret: this.clientSecret } : {}),
    };

    if (!this.oauthProvider) {
      if (!this.serverId) {
        throw new Error('serverId required for OAuth provider initialization');
      }

      this.oauthProvider = new RedisOAuthClientProvider(
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

    if (!this.transport) {
      const baseUrl = new URL(this.serverUrl);
      const tt = this.transportType || 'streamable_http';

      this._onObservabilityEvent.fire({
        level: 'debug',
        message: `Creating ${tt} transport`,
        sessionId: this.sessionId,
        serverId: this.serverId,
        metadata: {
          baseUrl: baseUrl.toString(),
          transportType: tt,
          hasAuthProvider: !!this.oauthProvider,
          hasHeaders: !!this.headers,
        },
        timestamp: Date.now(),
      });

      if (tt === 'sse') {
        this.transport = new SSEClientTransport(baseUrl, {
          authProvider: this.oauthProvider!,
          ...(this.headers && { headers: this.headers }),
        });
        this.emitProgress('SSE transport created');
      } else {
        this.transport = new StreamableHTTPClientTransport(baseUrl, {
          authProvider: this.oauthProvider!,
          ...(this.headers && { headers: this.headers }),
        });
        this.emitProgress('StreamableHTTP transport created');
      }
    }
  }

  /**
   * Saves current session state to Redis
   * @param active - Whether the session is active (connected and authenticated)
   * @private
   */
  private async saveSession(active: boolean = true): Promise<void> {
    if (!this.sessionId || !this.serverId || !this.serverUrl || !this.callbackUrl) {
      return;
    }

    await sessionStore.setClient({
      sessionId: this.sessionId,
      serverId: this.serverId,
      serverName: this.serverName,
      serverUrl: this.serverUrl,
      callbackUrl: this.callbackUrl,
      transportType: this.transportType || 'streamable_http',
      identity: this.identity,
      active,
    });
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

    if (!this.client || !this.transport) {
      const error = 'Client or transport not initialized';
      this.emitError(error, 'connection');
      this.emitStateChange('FAILED');
      throw new Error(error);
    }

    try {
      this.emitProgress('Validating OAuth tokens...');
      const hasValidTokens = await this.getValidTokens();

      this._onObservabilityEvent.fire({
        level: 'debug',
        message: `Token validation result: ${hasValidTokens}`,
        sessionId: this.sessionId,
        serverId: this.serverId,
        metadata: { hasValidTokens },
        timestamp: Date.now(),
      });

      this.emitStateChange('CONNECTING');

      this._onObservabilityEvent.fire({
        level: 'debug',
        message: 'Initiating client.connect()',
        sessionId: this.sessionId,
        serverId: this.serverId,
        metadata: {
          transportType: this.transportType,
          serverUrl: this.serverUrl,
        },
        timestamp: Date.now(),
      });

      await this.client.connect(this.transport);

      this._onObservabilityEvent.fire({
        level: 'debug',
        message: 'client.connect() completed successfully',
        sessionId: this.sessionId,
        serverId: this.serverId,
        timestamp: Date.now(),
      });

      this.emitStateChange('CONNECTED');
      this.emitProgress('Connected successfully');

      this._onObservabilityEvent.fire({
        type: 'mcp:client:connect',
        displayMessage: `Connection established for ${this.serverId}`,
        level: 'info',
        sessionId: this.sessionId,
        serverId: this.serverId,
        payload: {
          url: this.serverUrl,
          transport: this.transportType,
          state: 'CONNECTED',
        },
        timestamp: Date.now(),
        id: nanoid(),
      });

      const existingSession = await sessionStore.getSession(this.identity, this.sessionId);
      if (!existingSession) {
        await this.saveSession(true);
      }
    } catch (error) {
      // Log detailed error information
      this._onObservabilityEvent.fire({
        level: 'error',
        message: 'Connection error caught',
        sessionId: this.sessionId,
        serverId: this.serverId,
        metadata: {
          error: error instanceof Error ? error.message : String(error),
          errorName: error instanceof Error ? error.constructor.name : typeof error,
          errorStack: error instanceof Error ? error.stack : undefined,
          serverUrl: this.serverUrl,
          transportType: this.transportType,
        },
        timestamp: Date.now(),
      });

      if (
        error instanceof SDKUnauthorizedError ||
        (error instanceof Error && error.message.toLowerCase().includes('unauthorized'))
      ) {
        this._onObservabilityEvent.fire({
          level: 'info',
          message: 'OAuth authorization required - generating authorization URL',
          sessionId: this.sessionId,
          serverId: this.serverId,
          timestamp: Date.now(),
        });

        this.emitStateChange('AUTHENTICATING');
        await this.saveSession(false);

        // Get OAuth authorization URL from provider
        let authUrl = '';
        if (this.oauthProvider) {
          authUrl = this.oauthProvider.authUrl || '';

          if (authUrl) {
            this._onObservabilityEvent.fire({
              level: 'debug',
              message: 'OAuth authorization URL available',
              sessionId: this.sessionId,
              serverId: this.serverId,
              metadata: { authUrl },
              timestamp: Date.now(),
            });
          } else {
            this._onObservabilityEvent.fire({
              level: 'warn',
              message: 'OAuth provider has no authorization URL yet - will be generated on first connection attempt',
              sessionId: this.sessionId,
              serverId: this.serverId,
              timestamp: Date.now(),
            });
          }
        }

        // Emit auth required event with URL
        if (this.serverId) {
          this._onConnectionEvent.fire({
            type: 'auth_required',
            sessionId: this.sessionId,
            serverId: this.serverId,
            authUrl,
            timestamp: Date.now(),
          });

          // Call onRedirect callback if provided
          if (authUrl && this.onRedirect) {
            this.onRedirect(authUrl);
          }
        }

        throw new UnauthorizedError('OAuth authorization required');
      }

      const errorMessage = error instanceof Error ? error.message : 'Connection failed';
      const detailedError = `${errorMessage} (Server: ${this.serverUrl}, Transport: ${this.transportType})`;
      this.emitError(detailedError, 'connection');
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
  async finishAuth(authCode: string): Promise<void> {
    this.emitStateChange('AUTHENTICATING');
    this.emitProgress('Exchanging authorization code for tokens...');

    await this.initialize();

    if (!this.oauthProvider || !this.transport) {
      const error = 'OAuth provider or transport not initialized';
      this.emitError(error, 'auth');
      this.emitStateChange('FAILED');
      throw new Error(error);
    }

    try {
      await this.transport.finishAuth(authCode);

      this.emitStateChange('AUTHENTICATED');
      this.emitProgress('Creating authenticated client...');

      this.client = new Client(
        {
          name: 'mcp-ts-oauth-client',
          version: '2.0',
        },
        { capabilities: {} }
      );

      const baseUrl = new URL(this.serverUrl!);
      const tt = this.transportType || 'streamable_http';

      if (tt === 'sse') {
        this.transport = new SSEClientTransport(baseUrl, {
          authProvider: this.oauthProvider!,
          ...(this.headers && { headers: this.headers }),
        });
      } else {
        this.transport = new StreamableHTTPClientTransport(baseUrl, {
          authProvider: this.oauthProvider!,
          ...(this.headers && { headers: this.headers }),
        });
      }

      this.emitStateChange('CONNECTING');
      await this.client.connect(this.transport);

      this.emitStateChange('CONNECTED');

      this._onObservabilityEvent.fire({
        type: 'mcp:client:connect',
        displayMessage: `Authentication completed for ${this.serverId}`,
        level: 'info',
        sessionId: this.sessionId,
        serverId: this.serverId,
        payload: {
          url: this.serverUrl,
          transport: this.transportType,
          state: 'CONNECTED',
        },
        timestamp: Date.now(),
        id: nanoid(),
      });

      await this.saveSession(true);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Authentication failed';
      this.emitError(errorMessage, 'auth');
      this.emitStateChange('FAILED');
      throw error;
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
    this.emitProgress('Discovering available tools...');

    try {
      const request: ListToolsRequest = {
        method: 'tools/list',
        params: {},
      };

      const result = await this.client.request(request, ListToolsResultSchema);

      // Emit tools discovered event
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

      this._onObservabilityEvent.fire({
        type: 'mcp:client:discovery',
        level: 'info',
        message: `Discovered ${result.tools.length} tools`,
        displayMessage: `Discovered ${result.tools.length} tools`,
        sessionId: this.sessionId,
        serverId: this.serverId,
        payload: {
          type: 'tools',
          count: result.tools.length,
          items: result.tools.map((t) => t.name),
        },
        timestamp: Date.now(),
        id: nanoid(),
      });

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
    this.emitProgress('Discovering prompts...');

    try {
      const request: ListPromptsRequest = {
        method: 'prompts/list',
        params: {},
      };

      const result = await this.client.request(request, ListPromptsResultSchema);

      this.emitStateChange('READY');
      this.emitProgress(`Discovered ${result.prompts.length} prompts`);

      this._onObservabilityEvent.fire({
        type: 'mcp:client:discovery',
        level: 'info',
        message: `Discovered ${result.prompts.length} prompts`,
        displayMessage: `Discovered ${result.prompts.length} prompts`,
        sessionId: this.sessionId,
        serverId: this.serverId,
        payload: {
          type: 'prompts',
          count: result.prompts.length,
          items: result.prompts.map((p) => p.name),
        },
        timestamp: Date.now(),
        id: nanoid(),
      });

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
    this.emitProgress('Discovering resources...');

    try {
      const request: ListResourcesRequest = {
        method: 'resources/list',
        params: {},
      };

      const result = await this.client.request(request, ListResourcesResultSchema);

      this.emitStateChange('READY');
      this.emitProgress(`Discovered ${result.resources.length} resources`);

      this._onObservabilityEvent.fire({
        type: 'mcp:client:discovery',
        level: 'info',
        message: `Discovered ${result.resources.length} resources`,
        displayMessage: `Discovered ${result.resources.length} resources`,
        sessionId: this.sessionId,
        serverId: this.serverId,
        payload: {
          type: 'resources',
          count: result.resources.length,
          items: result.resources.map((r) => r.uri),
        },
        timestamp: Date.now(),
        id: nanoid(),
      });

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

    const baseUrl = new URL(this.serverUrl!);
    const tt = this.transportType || 'streamable_http';

    if (tt === 'sse') {
      this.transport = new SSEClientTransport(baseUrl, {
        authProvider: this.oauthProvider,
      });
    } else {
      this.transport = new StreamableHTTPClientTransport(baseUrl, {
        authProvider: this.oauthProvider,
      });
    }

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

    await sessionStore.removeSession(this.identity, this.sessionId);
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
   * Gets MCP server configuration for all active user sessions
   * Loads sessions from Redis, validates OAuth tokens, refreshes if expired
   * Returns ready-to-use configuration with valid auth headers
   * @param identity - User ID to fetch sessions for
   * @returns Object keyed by sanitized server labels containing transport, url, headers, etc.
   * @static
   */
  static async getMcpServerConfig(identity: string): Promise<Record<string, any>> {
    const mcpConfig: Record<string, any> = {};
    const sessionIds = await sessionStore.getIdentityMcpSessions(identity);

    for (const sessionId of sessionIds) {
      try {
        // Load session from Redis
        const sessionData = await sessionStore.getSession(identity, sessionId);

        // Validate session - remove if invalid or inactive
        if (
          !sessionData ||
          !sessionData.active ||
          !sessionData.identity ||
          !sessionData.serverId ||
          !sessionData.transportType ||
          !sessionData.serverUrl
        ) {
          await sessionStore.removeSession(identity, sessionId);
          continue;
        }

        // Get OAuth headers if session requires authentication
        let headers: Record<string, string> | undefined;
        try {
          const client = new MCPClient({ identity, sessionId });
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
        await sessionStore.removeSession(identity, sessionId);
        console.warn(`[MCP] Failed to process session ${sessionId}:`, error);
      }
    }

    return mcpConfig;
  }
}
