import type { SessionStore, Session } from '../storage/types.js';
import { sessions } from '../storage/index.js';
import { McpClient } from '../mcp/client.js';
import { parseOAuthState } from '../../shared/utils.js';
import { STATE_EXPIRATION_MS } from '../../shared/constants.js';
import { discoverOAuthServerInfo } from '@modelcontextprotocol/client';
import type {
  CallToolResult,
  GetPromptResult,
  ReadResourceResult,
} from '@modelcontextprotocol/client';
import type {
  McpServer,
  McpServersFindParameters,
  McpServersFindResponse,
  McpServersCreateParameters,
  McpServersGetByIdParameters,
  McpServersUpdateParameters,
  McpServersDeleteParameters,
  McpServersDeleteResponse,
  McpServersCreateOAuthUrlParameters,
  McpServersCreateOAuthUrlResponse,
  McpServersFinishAuthParameters,
  McpServersDiscoverOAuthParameters,
  McpServersDiscoverOAuthResponse,
  McpServersListToolsParameters,
  McpServersListToolsResponse,
  McpServersCallToolParameters,
  McpServersListPromptsParameters,
  McpServersListPromptsResponse,
  McpServersGetPromptParameters,
  McpServersListResourcesParameters,
  McpServersListResourcesResponse,
  McpServersReadResourceParameters,
  McpServersListResourceTemplatesParameters,
  McpServersListResourceTemplatesResponse,
} from '../../shared/types.js';
import {
  toMcpServer,
  toSession,
  toSessionPatch,
} from './transformers.js';
import { assertToolAllowed, filterToolsByPolicy } from '../storage/tool-policy.js';


export interface McpServersResourceOptions {
  storage?: SessionStore;
  /** Optional hook to remove session from active in-memory connection pools */
  onDeleteSession?: (userId: string, sessionId: string) => Promise<void> | void;
}

/**
 * Resource manager for Model Context Protocol servers.
 * Exposes a clean CRUD API for managing server configurations, OAuth flows, and remote capability execution.
 */
export class McpServersResource {
  private readonly storage: SessionStore;
  private readonly onDeleteSession?: (userId: string, sessionId: string) => Promise<void> | void;
  private readonly clientPool = new Map<string, McpClient>();

  constructor(options: McpServersResourceOptions = {}) {
    this.storage = options.storage ?? sessions;
    this.onDeleteSession = options.onDeleteSession;
  }

  private getClientKey(userId: string, targetId: string): string {
    return `${userId}:${targetId}`;
  }

  /**
   * Retrieves or establishes an active connection to an MCP server from the pool.
   */
  private async getClient(userId: string, targetId: string): Promise<McpClient> {
    const session = await this.findSession(userId, targetId);
    if (!session) {
      throw new Error(`MCP server "${targetId}" not found for user "${userId}"`);
    }
    if (session.enabled === false) {
      throw new Error(`MCP server "${targetId}" is disabled`);
    }

    const key = this.getClientKey(userId, session.sessionId);
    const existing = this.clientPool.get(key);
    if (existing) {
      return existing;
    }

    const mcpClient = new McpClient({
      userId: session.userId,
      sessionId: session.sessionId,
      serverId: session.serverId,
      serverUrl: session.serverUrl,
      serverName: session.serverName,
      callbackUrl: session.callbackUrl,
      headers: session.headers,
      clientMetadataUrl: session.serverOptions?.clientMetadataUrl,
      sessionStore: this.storage,
    });

    await mcpClient.connect();
    this.clientPool.set(key, mcpClient);
    return mcpClient;
  }

  /**
   * Helper to resolve a storage session by serverId or sessionId.
   * Uses findOne for an O(1) secondary index lookup when available.
   */
  private async findSession(userId: string, targetId: string): Promise<Session | null> {
    // Fast-path 1: direct sessionId lookup
    const direct = await this.storage.get(userId, targetId);
    if (direct) return direct;

    // Fast-path 2: indexed serverId lookup (O(1) on SQL/Supabase/Neon)
    if (this.storage.findOne) {
      return (await this.storage.findOne(userId, { serverId: targetId })) ?? null;
    }
    const [byServerId] = await this.storage.list(userId, { serverId: targetId });
    return byServerId ?? null;
  }

  /**
   * Find MCP servers for a given user with optional filtering.
   */
  async find(params: McpServersFindParameters): Promise<McpServersFindResponse> {
    const rawSessions = await this.storage.list(params.userId, {
      enabled: params.enabled,
    });

    let filtered = rawSessions;

    if (params.enabled !== undefined) {
      filtered = filtered.filter((s) => (s.enabled !== false) === params.enabled);
    }

    if (params.search && params.search.trim()) {
      const q = params.search.trim().toLowerCase();
      filtered = filtered.filter((s) => {
        const name = (s.serverName || s.serverId || '').toLowerCase();
        const url = s.serverUrl.toLowerCase();
        const desc = (s.metadata?.description || '').toLowerCase();
        return name.includes(q) || url.includes(q) || desc.includes(q);
      });
    }

    return {
      object: 'list',
      data: filtered.map(toMcpServer),
    };
  }

  /**
   * Alias for `find`.
   */
  async list(params: McpServersFindParameters): Promise<McpServersFindResponse> {
    return this.find(params);
  }

  /**
   * Discovers OAuth 2.1 metadata and endpoints for a target MCP server URL.
   */
  async discoverOAuth(
    params: McpServersDiscoverOAuthParameters
  ): Promise<McpServersDiscoverOAuthResponse> {
    if (!params.url) {
      throw new Error('url is required');
    }

    try {
      const info = await discoverOAuthServerInfo(params.url);
      if (info?.authorizationServerMetadata) {
        const as = info.authorizationServerMetadata;
        return {
          supported: true,
          authorizationUrl: as.authorization_endpoint,
          tokenUrl: as.token_endpoint,
          registrationUrl: as.registration_endpoint,
          resourceUrl:
            info.resourceMetadata?.resource ||
            (as as any).resource,
          scopes: as.scopes_supported,
          clientIdMetadataDocumentSupported: as.client_id_metadata_document_supported,
        };
      }
      return {
        supported: false,
        error: `Error fetching OAuth configuration: MCP server ${params.url} does not implement OAuth`,
      };
    } catch {
      return {
        supported: false,
        error: `Error fetching OAuth configuration: MCP server ${params.url} does not implement OAuth`,
      };
    }
  }

  /**
   * Registers a new MCP server configuration for a user.
   * Auto-validates connectivity and authentication requirements during registration.
   */
  async create(params: McpServersCreateParameters): Promise<McpServer> {
    const session = toSession(params);
    let authRedirectUrl: string | undefined;

    if (session.enabled !== false) {
      // Validate connectivity and authentication
      const mcpClient = new McpClient({
        userId: session.userId,
        sessionId: session.sessionId,
        serverId: session.serverId,
        serverUrl: session.serverUrl,
        serverName: session.serverName,
        callbackUrl: session.callbackUrl,
        headers: session.headers,
        clientMetadataUrl: session.serverOptions?.clientMetadataUrl,
        sessionStore: this.storage,
        onRedirect: (url: string) => {
          authRedirectUrl = url;
        },
      });

      try {
        await mcpClient.connect();
        const hasAuthUrl = Boolean(authRedirectUrl || (mcpClient.oauthProvider as any)?.authUrl);
        if (hasAuthUrl) {
          session.status = 'pending';
        } else {
          session.status = 'active';
          if (session.metadata?.lastError) {
            const { lastError, ...restMeta } = session.metadata;
            session.metadata = Object.keys(restMeta).length > 0 ? restMeta : undefined;
          }
        }
      } catch (err: any) {
        const hasAuthUrl = Boolean(authRedirectUrl || (mcpClient.oauthProvider as any)?.authUrl);
        if (hasAuthUrl) {
          session.status = 'pending';
        } else {
          const isAuthError =
            err?.message?.toLowerCase().includes('unauthorized') ||
            err?.message?.toLowerCase().includes('oauth') ||
            err?.status === 401 ||
            err?.status === 403;

          session.metadata = {
            ...(session.metadata || {}),
            lastError: err?.message || (isAuthError ? 'Authentication required for MCP server' : 'Server unreachable'),
          };
          session.status = 'pending';
        }
      } finally {
        // Always disconnect the temporary probe client — it is not pooled
        await mcpClient.disconnect().catch(() => {});
      }
    }

    const existing = await this.storage.get(session.userId, session.sessionId);
    if (existing) {
      await this.storage.update(session.userId, session.sessionId, session);
    } else {
      await this.storage.create(session);
    }

    // Persist OAuth clientInformation (clientId + clientSecret) to the credentials
    // partition of durable storage backends (Supabase, Neon, SQLite, Redis).
    if (session.clientInformation) {
      await this.storage.patchCredentials(session.userId, session.sessionId, {
        clientInformation: session.clientInformation,
      }).catch(() => {});
    }

    const result = toMcpServer(session);
    if (authRedirectUrl && result.status.state === 'auth_required') {
      result.status.authorizationUrl = authRedirectUrl;
    }
    return result;
  }

  /**
   * Retrieves a specific MCP server by ID.
   */
  async getById(params: McpServersGetByIdParameters): Promise<McpServer | null> {
    if (!params.serverId) {
      throw new Error('serverId is required');
    }
    const session = await this.findSession(params.userId, params.serverId);
    if (!session) return null;
    return toMcpServer(session);
  }

  /**
   * Alias for `getById`.
   */
  async get(params: McpServersGetByIdParameters): Promise<McpServer | null> {
    return this.getById(params);
  }

  /**
   * Updates an existing MCP server configuration. Supports partial updates.
   */
  async update(params: McpServersUpdateParameters): Promise<McpServer> {
    if (!params.serverId) {
      throw new Error('serverId is required');
    }
    const existing = await this.findSession(params.userId, params.serverId);
    if (!existing) {
      throw new Error(`MCP server "${params.serverId}" not found for user "${params.userId}"`);
    }

    const patch = toSessionPatch(params, existing);
    await this.storage.update(params.userId, existing.sessionId, patch);

    // Persist updated OAuth clientInformation to the credentials partition
    if (patch.clientInformation) {
      await this.storage.patchCredentials(params.userId, existing.sessionId, {
        clientInformation: patch.clientInformation,
      }).catch(() => {});
    }

    const key = this.getClientKey(params.userId, existing.sessionId);
    const existingClient = this.clientPool.get(key);
    if (existingClient) {
      this.clientPool.delete(key);
      await existingClient.disconnect().catch(() => {});
    }

    return toMcpServer({ ...existing, ...patch });
  }

  /**
   * Deletes an MCP server configuration. Cleans up associated storage records and tokens.
   */
  async delete(params: McpServersDeleteParameters): Promise<McpServersDeleteResponse> {
    if (!params.serverId) {
      throw new Error('serverId is required');
    }
    const session = await this.findSession(params.userId, params.serverId);
    if (session) {
      const key = this.getClientKey(params.userId, session.sessionId);
      const existingClient = this.clientPool.get(key);
      if (existingClient) {
        this.clientPool.delete(key);
        await existingClient.disconnect().catch(() => {});
      }
      if (this.onDeleteSession) {
        await this.onDeleteSession(params.userId, session.sessionId);
      }
      await this.storage.delete(params.userId, session.sessionId).catch(() => undefined);
    }

    return {
      object: 'mcp_server',
      id: params.serverId,
      deleted: true,
    };
  }

  /**
   * Generates an OAuth 2.1 authorization URL for an MCP server requiring browser login.
   */
  async createOAuthAuthorizationUrl(
    params: McpServersCreateOAuthUrlParameters
  ): Promise<McpServersCreateOAuthUrlResponse> {
    if (!params.serverId) {
      throw new Error('serverId is required');
    }
    const session = await this.findSession(params.userId, params.serverId);
    if (!session) {
      throw new Error(`MCP server "${params.serverId}" not found for user "${params.userId}"`);
    }

    let authRedirectUrl: string | undefined;

    const mcpClient = new McpClient({
      userId: params.userId,
      sessionId: session.sessionId,
      serverId: session.serverId,
      serverUrl: session.serverUrl,
      serverName: session.serverName,
      callbackUrl: params.callbackUrl || session.callbackUrl,
      headers: session.headers,
      clientMetadataUrl: params.clientMetadataUrl || session.serverOptions?.clientMetadataUrl,
      sessionStore: this.storage,
      onRedirect: (url: string) => {
        authRedirectUrl = url;
      },
    });

    let connectError: any = null;
    try {
      await mcpClient.connect();
    } catch (err) {
      // Connect is expected to throw when OAuth authorization is required
      connectError = err;
    }

    const authUrl = authRedirectUrl || (mcpClient.oauthProvider as any)?.authUrl || session.authUrl;
    if (!authUrl) {
      try {
        const info = await discoverOAuthServerInfo(session.serverUrl);
        if (!info?.authorizationServerMetadata) {
          throw new Error(`Error fetching OAuth configuration: MCP server ${session.serverUrl} does not implement OAuth`);
        }
      } catch (discErr: any) {
        if (discErr.message?.includes('does not implement OAuth')) {
          throw discErr;
        }
      }

      const errorMsg = connectError?.message ? `: ${connectError.message}` : '';
      throw new Error(`Failed to generate OAuth authorization URL for MCP server "${params.serverId}"${errorMsg}`);
    }

    let state = '';
    try {
      const parsedUrl = new URL(authUrl);
      state = parsedUrl.searchParams.get('state') || '';
    } catch {}

    const creds = await this.storage.getCredentials(params.userId, session.sessionId);
    const createdAt = creds?.oauthState?.createdAt ?? Date.now();
    const expiresAt = new Date(createdAt + STATE_EXPIRATION_MS).toISOString();

    return {
      object: 'mcp_server_oauth_authorization',
      serverId: session.serverId || params.serverId,
      url: authUrl,
      state,
      expiresAt,
    };
  }


  /**
   * Completes an OAuth 2.1 authorization flow with authorization code and state.
   */
  async finishAuth(params: McpServersFinishAuthParameters): Promise<McpServer> {
    const serverId = params.serverId || parseOAuthState(params.state)?.sessionId;
    if (!serverId) {
      throw new Error('Unable to resolve serverId from OAuth state or parameters');
    }

    const session = await this.findSession(params.userId, serverId);
    if (!session) {
      throw new Error(`MCP server session "${serverId}" not found for user "${params.userId}"`);
    }

    const mcpClient = new McpClient({
      userId: params.userId,
      sessionId: session.sessionId,
      serverId: session.serverId,
      serverUrl: session.serverUrl,
      callbackUrl: session.callbackUrl,
      sessionStore: this.storage,
    });

    await mcpClient.finishAuth(params.code, params.state, params.iss);

    const updated = await this.storage.get(params.userId, session.sessionId);
    return toMcpServer(updated ?? session);
  }

  /**
   * Lists available tools from an MCP server.
   *
   * By default returns all tools so management UIs can inspect and configure
   * allow/denylists. Pass `{ filtered: true }` to apply the server's toolPolicy.
   */
  async listTools(
    params: McpServersListToolsParameters & { filtered?: boolean }
  ): Promise<McpServersListToolsResponse> {
    if (!params.userId || !params.serverId) {
      throw new Error('userId and serverId are required');
    }
    const session = await this.findSession(params.userId, params.serverId);
    if (!session) {
      throw new Error(`MCP server "${params.serverId}" not found for user "${params.userId}"`);
    }
    if (session.enabled === false) {
      throw new Error(`MCP server "${params.serverId}" is disabled`);
    }
    const client = await this.getClient(params.userId, params.serverId);
    const result = await client.listTools();
    const tools = params.filtered && session.toolPolicy
      ? filterToolsByPolicy(result.tools, session.toolPolicy, session.serverId)
      : result.tools;
    return { tools };
  }

  /**
   * Executes a tool on an MCP server.
   *
   * Enforces the server's toolPolicy by default. Pass `{ bypassPolicy: true }`
   * only for administrative diagnostics.
   */
  async callTool(
    params: McpServersCallToolParameters & { bypassPolicy?: boolean }
  ): Promise<CallToolResult> {
    if (!params.userId || !params.serverId || !params.toolName) {
      throw new Error('userId, serverId, and toolName are required');
    }
    const session = await this.findSession(params.userId, params.serverId);
    if (!session) {
      throw new Error(`MCP server "${params.serverId}" not found for user "${params.userId}"`);
    }
    if (session.enabled === false) {
      throw new Error(`MCP server "${params.serverId}" is disabled`);
    }
    if (!params.bypassPolicy && session.toolPolicy) {
      assertToolAllowed(session.toolPolicy, params.toolName, session.serverId);
    }
    const client = await this.getClient(params.userId, params.serverId);
    try {
      return await client.callTool(params.toolName, params.args ?? {});
    } catch (err) {
      // On error, evict the pooled client so next call reconnects cleanly
      this.clientPool.delete(this.getClientKey(params.userId, session.sessionId));
      throw err;
    }
  }

  /**
   * Lists available prompts from an MCP server.
   */
  async listPrompts(params: McpServersListPromptsParameters): Promise<McpServersListPromptsResponse> {
    if (!params.userId || !params.serverId) {
      throw new Error('userId and serverId are required');
    }
    const client = await this.getClient(params.userId, params.serverId);
    const result = await client.listPrompts();
    return { prompts: result.prompts };
  }

  /**
   * Gets a specific prompt with arguments from an MCP server.
   */
  async getPrompt(params: McpServersGetPromptParameters): Promise<GetPromptResult> {
    if (!params.userId || !params.serverId || !params.name) {
      throw new Error('userId, serverId, and name are required');
    }
    const client = await this.getClient(params.userId, params.serverId);
    return await client.getPrompt(params.name, params.args);
  }

  /**
   * Lists available resources from an MCP server.
   */
  async listResources(params: McpServersListResourcesParameters): Promise<McpServersListResourcesResponse> {
    if (!params.userId || !params.serverId) {
      throw new Error('userId and serverId are required');
    }
    const client = await this.getClient(params.userId, params.serverId);
    const result = await client.listResources();
    return { resources: result.resources };
  }

  /**
   * Reads a specific resource URI from an MCP server.
   */
  async readResource(params: McpServersReadResourceParameters): Promise<ReadResourceResult> {
    if (!params.userId || !params.serverId || !params.uri) {
      throw new Error('userId, serverId, and uri are required');
    }
    const client = await this.getClient(params.userId, params.serverId);
    return await client.readResource(params.uri);
  }

  /**
   * Lists available resource templates from an MCP server.
   */
  async listResourceTemplates(
    params: McpServersListResourceTemplatesParameters
  ): Promise<McpServersListResourceTemplatesResponse> {
    if (!params.userId || !params.serverId) {
      throw new Error('userId and serverId are required');
    }
    const client = await this.getClient(params.userId, params.serverId);
    const templates = await client.fetchResourceTemplates();
    return { resourceTemplates: templates };
  }
}

