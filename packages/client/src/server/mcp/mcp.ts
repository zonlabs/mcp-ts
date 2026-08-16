import { nanoid } from 'nanoid';
import { McpClient, type McpClientOptions } from './client.js';
import { McpManager, type McpManagerOptions } from './manager.js';
import type { BaseClient, BaseClientProvider } from '../../shared/types.js';
import type { Session, SessionStore } from '../storage/types.js';
import { sessions } from '../storage/index.js';
import { parseOAuthState } from '../../shared/utils.js';

// ---------------------------------------------------------------------------
// Types & Options
// ---------------------------------------------------------------------------

export interface McpOptions {
  /**
   * Global storage backend (e.g. SqliteStorage, SupabaseStorageBackend, RedisStorageBackend, FileStorageBackend).
   * Defaults to the global `sessions` store.
   */
  storage?: SessionStore;
}

export interface McpUserOptions extends McpManagerOptions {
  /**
   * Custom session storage store (e.g. SqliteStorage, SupabaseStorageBackend, RedisStorageBackend).
   * Defaults to the parent Mcp instance's storage.
   */
  sessionStore?: SessionStore;
}

export interface AddMcpServerOptions extends Omit<McpClientOptions, 'userId' | 'serverUrl' | 'sessionId'> {
  /** Custom session identifier override (defaults to auto-generated `sess_<serverId>_<nanoid>`) */
  sessionId?: string;
}

export interface AddMcpServerResult {
  /** Whether the connection succeeded immediately without requiring user interaction */
  success: boolean;
  /** True if OAuth 2.1 browser authorization is required from the user */
  authRequired?: boolean;
  /** The OAuth authorization redirect URL to send to the user's browser */
  authUrl?: string;
  /** The connected `McpClient` instance if connection succeeded immediately */
  client?: McpClient;
  /** The persistent session identifier associated with this connection */
  sessionId: string;
}

// ---------------------------------------------------------------------------
// McpUser Class (User Context)
// ---------------------------------------------------------------------------

/**
 * Scoped user context for Model Context Protocol operations.
 *
 * Provides a unified interface to connect, manage, and execute tools across
 * all MCP servers associated with a specific user or tenant.
 *
 * @example
 * ```ts
 * const user = mcp.user("user_123");
 * await user.connect();
 *
 * // Add a new server
 * const res = await user.addServer("https://mcp.tavily.com/mcp");
 *
 * // List and call tools
 * const { tools } = await user.listTools();
 * const result = await user.callTool("tavily_search", { query: "news" });
 * ```
 */
export class McpUser implements BaseClientProvider {
  public readonly userId: string;
  private readonly manager: McpManager;
  private readonly store: SessionStore;

  constructor(userId: string, options: McpUserOptions = {}) {
    this.userId = userId;
    this.store = options.sessionStore ?? sessions;
    this.manager = new McpManager(userId, {
      sessionStore: this.store,
      ...options,
    });
  }

  /**
   * Connects all active MCP server sessions for this user.
   */
  async connect(): Promise<void> {
    await this.manager.connect();
  }

  /**
   * Disconnects all active MCP sessions for this user and frees underlying resources.
   */
  async disconnect(): Promise<void> {
    await this.manager.disconnect();
  }

  /**
   * Reconnects all sessions for this user, clearing stale in-memory transports.
   */
  async reconnect(): Promise<void> {
    await this.manager.reconnect();
  }

  /**
   * Returns all currently active `BaseClient` instances.
   */
  getClients(): BaseClient[] {
    return this.manager.getClients();
  }

  /**
   * Adds and connects a new remote MCP server for this user.
   *
   * If the server responds with a 401 requiring OAuth 2.1 sign-in, the session is saved
   * as `pending` and the returned object contains `{ authRequired: true, authUrl, sessionId }`.
   *
   * @param serverUrl - The remote server HTTP/HTTPS endpoint
   * @param options - Optional connection configuration
   * @returns Result indicating whether connection succeeded immediately or requires browser redirect
   */
  async addMcpServer(serverUrl: string, options: AddMcpServerOptions = {}): Promise<AddMcpServerResult> {
    const url = new URL(serverUrl);
    const host = url.hostname.replace(/[^a-zA-Z0-9_-]+/g, '_');
    const path = url.pathname.replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_|_$/g, '');
    const serverId = `${host}${path ? `_${path}` : ''}`.toLowerCase();
    const sessionId = options.sessionId ?? `sess_${serverId}_${nanoid(8)}`;

    let authRedirectUrl: string | undefined;

    const client = new McpClient({
      userId: this.userId,
      sessionId,
      serverId,
      serverUrl: url.toString(),
      serverName: options.serverName || url.hostname,
      callbackUrl: options.callbackUrl || 'http://localhost/oauth/callback',
      headers: options.headers,
      sessionStore: options.sessionStore ?? this.store,
      onRedirect: (redirectUrl: string) => {
        authRedirectUrl = redirectUrl;
      },
    });

    try {
      await client.connect();
      return {
        success: true,
        client,
        sessionId,
      };
    } catch (error) {
      const authUrl = authRedirectUrl || (client.oauthProvider as any)?.authUrl;
      const isAuthError =
        authUrl !== undefined ||
        (error instanceof Error && error.message.toLowerCase().includes('unauthorized')) ||
        (error instanceof Error && error.message.toLowerCase().includes('authorization required'));

      if (isAuthError && authUrl) {
        return {
          success: false,
          authRequired: true,
          authUrl,
          sessionId,
        };
      }

      throw error;
    }
  }

  /**
   * Removes and disconnects an MCP server session for this user.
   * Deletes session credentials from storage and terminates active connections.
   *
   * @param sessionId - The session identifier to remove
   */
  async removeMcpServer(sessionId: string): Promise<boolean> {
    await this.manager.removeSession(sessionId);
    await this.store.delete(this.userId, sessionId).catch(() => undefined);
    return true;
  }

  /**
   * Lists all stored MCP servers/sessions for this user.
   */
  async listMcpServers(): Promise<Session[]> {
    return this.store.list(this.userId);
  }

  /**
   * Gets a specific stored MCP server/session by its sessionId.
   */
  async getMcpServer(sessionId: string): Promise<Session | null> {
    return this.store.get(this.userId, sessionId);
  }

  /**
   * Lists all aggregated tools available across all connected servers for this user.
   */
  async listTools(): Promise<{ tools: import('@modelcontextprotocol/client').Tool[] }> {
    const clients = this.getClients();
    const results = await Promise.all(
      clients.map(client => client.listTools().catch(() => ({ tools: [] })))
    );
    return { tools: results.flatMap(r => r.tools) };
  }

  /**
   * Executes a tool across the user's connected MCP servers.
   * Automatically routes the call to the owning server.
   *
   * @param name - The tool name
   * @param args - Key-value map of tool arguments
   */
  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    const clients = this.getClients();
    for (const client of clients) {
      try {
        const { tools } = await client.listTools();
        if (tools.some(t => t.name === name)) {
          return await client.callTool(name, args);
        }
      } catch {
        // Continue searching other clients
      }
    }
    throw new Error(`Tool "${name}" was not found across any connected MCP servers for user "${this.userId}".`);
  }

  /**
   * Completes an OAuth 2.1 authorization callback for this user.
   * Exchanges the authorization code for tokens and activates the session in storage.
   *
   * @param code - The authorization code from the OAuth redirect query parameters
   * @param state - The state parameter from the OAuth redirect query parameters
   * @param iss - Optional RFC 9207 issuer identifier
   */
  async finishAuth(code: string, state: string, iss?: string): Promise<void> {
    const parsed = parseOAuthState(state);
    if (!parsed?.sessionId) {
      throw new Error('Unable to parse valid sessionId from OAuth state parameter');
    }

    await this.finishAuthSession(parsed.sessionId, code, state, iss);
  }

  /**
   * Completes an OAuth 2.1 authorization callback for an explicit session ID.
   *
   * @param sessionId - The session identifier to complete
   * @param code - The authorization code from the OAuth redirect query parameters
   * @param state - Optional state parameter
   * @param iss - Optional RFC 9207 issuer identifier
   */
  async finishAuthSession(sessionId: string, code: string, state?: string, iss?: string): Promise<void> {
    const session = await this.store.get(this.userId, sessionId);
    if (!session) {
      throw new Error(`Session "${sessionId}" not found for user "${this.userId}"`);
    }

    const client = new McpClient({
      userId: this.userId,
      sessionId: session.sessionId,
      serverId: session.serverId,
      serverUrl: session.serverUrl,
      callbackUrl: session.callbackUrl,
      sessionStore: this.store,
    });

    await client.finishAuth(code, state, iss);
  }
}

// ---------------------------------------------------------------------------
// Top-Level Mcp Class (App / Storage Context)
// ---------------------------------------------------------------------------

/**
 * Top-level entry point for the Model Context Protocol SDK.
 *
 * @example
 * ```ts
 * import { Mcp, SqliteStorage } from "@mcp-ts/client";
 *
 * export const mcp = new Mcp({
 *   storage: new SqliteStorage({ path: "./data/mcp.sqlite" }),
 * });
 *
 * // In your route/agent:
 * const user = mcp.user("user_123");
 * await user.connect();
 * const { tools } = await user.listTools();
 * ```
 */
export class Mcp {
  public readonly storage: SessionStore;

  constructor(options: McpOptions = {}) {
    this.storage = options.storage ?? sessions;
  }

  /**
   * Returns an `McpUser` instance scoped to a specific user or tenant.
   *
   * @param userId - Unique user or tenant identifier
   * @param options - Optional user configuration overrides
   */
  user(userId: string, options?: Omit<McpUserOptions, 'sessionStore'>): McpUser {
    return new McpUser(userId, {
      sessionStore: this.storage,
      ...options,
    });
  }
}

/**
 * Default zero-config global `mcp` instance using standard storage.
 */
export const mcp = new Mcp();
