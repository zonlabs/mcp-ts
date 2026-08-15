/**
 * SSE (Server-Sent Events) Handler for MCP Connections.
 *
 * Provides real-time bidirectional communication between browser clients and
 * MCP servers via a single HTTP endpoint:
 * - GET  → opens an SSE stream for server → client events
 * - POST → delivers client → server RPC requests with direct HTTP response
 *
 * Built on {@link SSEConnectionManager} which handles the RPC dispatch logic,
 * session lifecycle, OAuth 2.1 flows, tool-policy enforcement, and heartbeat
 * keep-alive — all while remaining stateless across serverless invocations.
 *
 * @module sse-handler
 */

import type { OAuthClientProvider } from '@modelcontextprotocol/client';
import type { McpConnectionEvent, McpObservabilityEvent } from '../../shared/events.js';
import type {
  McpRpcRequest,
  McpRpcResponse,
  ConnectParams,
  DisconnectParams,
  ReconnectParams,
  SessionParams,
  CallToolParams,
  GetPromptParams,
  ReadResourceParams,
  FinishAuthParams,
  SessionListResult,
  ConnectResult,
  DisconnectResult,
  GetSessionResult,
  FinishAuthResult,
  ListToolsRpcResult,
  ListPromptsResult,
  ListResourcesResult,
  ListResourceTemplatesResult,
  CallToolResult,
  SetToolPolicyParams,
  SetToolPolicyResult,
  GetToolPolicyParams,
  GetToolPolicyResult,
  UpdateSessionParams,
  UpdateSessionResult,
} from '../../shared/types.js';
import { RpcErrorCodes, UnauthorizedError } from '../../shared/errors.js';
import { isConnectionEvent, isRpcResponseEvent } from '../../shared/event-routing.js';
import { parseOAuthState } from '../../shared/utils.js';
import { McpClient, type McpSdkClientOptions } from '../mcp/client.js';
import { sessions, generateServerId, withDbObservability, type Session, type SessionStore } from '../storage/index.js';
import {
  createToolId,
  isToolAllowed,
  normalizeToolPolicyForUpdate,
  validateToolPolicyAgainstTools,
} from '../storage/tool-policy.js';
import { createToolPolicyGateway } from '../mcp/tool-policy-gateway.js';
import { runWithCodeVerifierState } from '../mcp/storage-oauth-provider.js';

// ---------------------------------------------------------------------------
// Public Types
// ---------------------------------------------------------------------------

/** OAuth client metadata surfaced during connection and authorization. */
export interface ClientMetadata {
  clientName?: string;
  clientUri?: string;
  logoUri?: string;
  policyUri?: string;
  oauthProvider?: OAuthClientProvider;
  client?: McpSdkClientOptions;
}

/** Options passed to {@link createSSEHandler}. */
export interface SSEHandlerOptions {
  /** Authenticated user / tenant identifier. */
  userId: string;

  /** Optional auth check — called per-request before any RPC dispatch. */
  onAuth?: (userId: string) => Promise<boolean>;

  /** SSE heartbeat interval in milliseconds. @default 30000 */
  heartbeatInterval?: number;

  /** Static OAuth client metadata applied to all connections. */
  clientDefaults?: ClientMetadata;

  /**
   * Dynamic OAuth client metadata resolver, called once per connection.
   * Overrides `clientDefaults`. Useful for multi-tenant scenarios where
   * metadata varies by request (headers, subdomain, etc.).
   */
  getClientMetadata?: (request?: unknown) => ClientMetadata | Promise<ClientMetadata>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_HEARTBEAT_MS = 30_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Merges nested SDK client options from handler defaults and dynamic metadata. */
function mergeClientCapabilities(
  defaults?: NonNullable<McpSdkClientOptions['capabilities']>,
  override?: NonNullable<McpSdkClientOptions['capabilities']>,
): NonNullable<McpSdkClientOptions['capabilities']> | undefined {
  if (!defaults && !override) return undefined;

  return {
    ...defaults,
    ...override,
    extensions: defaults?.extensions || override?.extensions
      ? {
          ...defaults?.extensions,
          ...override?.extensions,
        }
      : undefined,
  };
}

function mergeMcpSdkClientOptions(
  defaults?: McpSdkClientOptions,
  override?: McpSdkClientOptions,
): McpSdkClientOptions | undefined {
  if (!defaults && !override) return undefined;

  return {
    ...defaults,
    ...override,
    versionNegotiation: defaults?.versionNegotiation || override?.versionNegotiation
      ? {
          ...defaults?.versionNegotiation,
          ...override?.versionNegotiation,
        }
      : undefined,
    capabilities: mergeClientCapabilities(defaults?.capabilities, override?.capabilities),
  };
}

export function mergeClientMetadata(defaults: ClientMetadata, override?: ClientMetadata): ClientMetadata {
  if (!override) return defaults;

  return {
    ...defaults,
    ...override,
    client: mergeMcpSdkClientOptions(defaults.client, override.client),
  };
}

/**
 * Normalizes a raw headers object: trims keys & string values,
 * drops entries with empty key or value, returns undefined when nothing remains.
 */
function normalizeHeaders(
  headers?: Record<string, string>,
): Record<string, string> | undefined {
  if (!headers || typeof headers !== 'object') return undefined;

  const entries = Object.entries(headers)
    .map(([k, v]) => [k.trim(), String(v).trim()] as const)
    .filter(([k, v]) => k.length > 0 && v.length > 0);

  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

/**
 * Formats a {@link McpConnectionEvent} `state_changed` payload for consistent
 * `VALIDATING` → `DISCONNECTED` transitions emitted during session restore.
 */
function validatingStateEvent(
  sessionId: string,
  session: Session,
): McpConnectionEvent {
  return {
    type: 'state_changed',
    sessionId,
    serverId: session.serverId ?? 'unknown',
    serverName: session.serverName ?? 'Unknown',
    serverUrl: session.serverUrl,
    state: 'VALIDATING',
    previousState: 'DISCONNECTED',
    timestamp: Date.now(),
  };
}

/**
 * Builds a `connection_error` event with the appropriate error type discriminator.
 */
function connectionErrorEvent(
  sessionId: string,
  serverId: string | undefined,
  error: unknown,
  errorType: 'connection' | 'validation' | 'auth',
): McpConnectionEvent {
  return {
    type: 'error',
    sessionId,
    serverId: serverId ?? 'unknown',
    error: error instanceof Error ? error.message : 'Connection failed',
    errorType,
    timestamp: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// SSEConnectionManager
// ---------------------------------------------------------------------------

/**
 * Manages a single browser-facing SSE connection and all MCP server sessions
 * owned by the associated user.
 *
 * ## Responsibilities
 * - RPC method dispatch (`connect`, `disconnect`, `callTool`, `listTools`, …)
 * - Session lifecycle: create, restore, re-validate, OAuth completion
 * - In-memory client cache (`Map<string, McpClient>`) for active transports
 * - SSE event emission for connection state, tool discovery, and errors
 * - Periodic heartbeat to prevent proxy/CDN timeouts
 * - Unified observability: RPC timing, DB operations, connection lifecycle
 *
 * Each instance is tied to one browser client. It is **not** a singleton —
 * a new instance is created per incoming SSE connection.
 */
export class SSEConnectionManager {
  // -----------------------------------------------------------------------
  // State
  // -----------------------------------------------------------------------

  private readonly userId: string;

  /** Active MCP transports keyed by sessionId. */
  private readonly clients = new Map<string, McpClient>();
  private readonly pendingClients = new Map<string, Promise<McpClient>>();

  /** Instrumented session store — always wraps `sessions` with DB observability. */
  private readonly observedStore: SessionStore;

  private heartbeatTimer: ReturnType<typeof setInterval> | undefined;
  private active = true;

  // -----------------------------------------------------------------------
  // Constructor
  // -----------------------------------------------------------------------

  /**
   * @param options  - Handler configuration (userId, auth, metadata, heartbeat, observability).
   * @param sendEvent - Callback that writes a typed event onto the SSE stream.
   */
  constructor(
    private readonly options: SSEHandlerOptions,
    private readonly sendEvent: (
      event: McpConnectionEvent | McpObservabilityEvent | McpRpcResponse,
    ) => void,
  ) {
    this.userId = options.userId;
    this.observedStore = withDbObservability(sessions, (event) => this.sendEvent(event));
    this.startHeartbeat();
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Dispatches an incoming RPC request, emits timing observability,
   * and returns the response.
   *
   * Emits `rpc:start` before dispatch and `rpc:end` on completion
   * (success or error), each carrying the method name, sessionId, and
   * duration. All events flow through the unified `onObservability`
   * and the SSE stream.
   *
   * @param request - The deserialized RPC envelope.
   * @returns The RPC response (success or error).
   */
  async handleRequest(request: McpRpcRequest): Promise<McpRpcResponse> {
    const method = request.method;
    const sessionId = (request.params as Record<string, unknown> | undefined)?.sessionId as string | undefined;
    const t0 = performance.now();

    this.sendEvent({
      type: 'rpc:start',
      level: 'debug',
      message: method,
      sessionId,
      timestamp: Date.now(),
    });

    try {
      const result = await this.dispatchImpl(request);

      this.sendEvent({
        type: 'rpc:end',
        level: 'debug',
        message: method,
        sessionId,
        payload: { durationMs: performance.now() - t0 },
        timestamp: Date.now(),
      });

      const response: McpRpcResponse = { id: request.id, result };
      this.sendEvent(response);
      return response;
    } catch (error) {
      this.sendEvent({
        type: 'rpc:end',
        level: 'error',
        message: method,
        sessionId,
        payload: { durationMs: performance.now() - t0, error: String(error) },
        timestamp: Date.now(),
      });

      const response: McpRpcResponse = {
        id: request.id,
        error: {
          code: RpcErrorCodes.EXECUTION_ERROR,
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      };
      this.sendEvent(response);
      return response;
    }
  }

  /**
   * Tears down all active MCP transports and stops the heartbeat timer.
   *
   * Disconnects are issued in parallel across all sessions. After calling
   * this method the manager instance should be discarded.
   */
  async dispose(): Promise<void> {
    this.active = false;
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);

    await Promise.all(
      Array.from(this.clients.values()).map((c) => c.disconnect()),
    );

    this.clients.clear();
  }

  // -----------------------------------------------------------------------
  // RPC Dispatch (raw — called by handleRequest which adds timing)
  // -----------------------------------------------------------------------

  /**
   * Routes an RPC method name to the appropriate private handler.
   *
   * @throws {Error} When the method name is unrecognized.
   */
  private async dispatchImpl(request: McpRpcRequest): Promise<unknown> {
    switch (request.method) {
      case 'listSessions':  return this.listSessions();
      case 'connect':       return this.connect(request.params as ConnectParams);
      case 'reconnect':     return this.reconnect(request.params as ReconnectParams);
      case 'disconnect':    return this.disconnect(request.params as DisconnectParams);
      case 'listTools':     return this.listTools(request.params as SessionParams);
      case 'setToolPolicy': return this.setToolPolicy(request.params as SetToolPolicyParams);
      case 'getToolPolicy': return this.getToolPolicy(request.params as GetToolPolicyParams);
      case 'updateSession': return this.updateSession(request.params as UpdateSessionParams);
      case 'callTool':      return this.callTool(request.params as CallToolParams);
      case 'getSession':    return this.getSession(request.params as SessionParams);
      case 'finishAuth':    return this.finishAuth(request.params as FinishAuthParams);
      case 'listPrompts':   return this.listPrompts(request.params as SessionParams);
      case 'getPrompt':     return this.getPrompt(request.params as GetPromptParams);
      case 'listResources':       return this.listResources(request.params as SessionParams);
      case 'listResourceTemplates': return this.listResourceTemplates(request.params as SessionParams);
      case 'readResource':        return this.readResource(request.params as ReadResourceParams);
      default:
        throw new Error(`Unknown RPC method: ${request.method}`);
    }
  }

  // -----------------------------------------------------------------------
  // Session Query
  // -----------------------------------------------------------------------

  /**
   * Lists all sessions owned by the current user.
   *
   * Returns a lightweight view — session metadata only, no credential fields.
   */
  private async listSessions(): Promise<SessionListResult> {
    const all = await sessions.list(this.userId);
    return {
      sessions: all.map((s) => ({
        sessionId:  s.sessionId,
        serverId:    s.serverId,
        serverName:  s.serverName,
        serverUrl:   s.serverUrl,
        transport:   s.serverOptions?.transport?.type,
        serverOptions: s.serverOptions ?? null,
        createdAt:   s.createdAt,
        updatedAt:   s.updatedAt ?? s.createdAt,
        status:      s.status ?? 'pending',
        toolPolicy:  s.toolPolicy,
        enabled:     s.enabled ?? true,
        protocolVersion: s.serverOptions?.transport?.protocolVersion ?? null,
        discoverResult: s.serverOptions?.discoverResult ?? null,
      })),
    };
  }

  /**
   * Restores and validates a previously persisted session.
   *
   * Loads the full session row (including credentials) from storage, creates
   * a new MCP transport, connects to the remote server, and emits the
   * discovered (policy-filtered) tool list via SSE.
   */
  private async getSession(params: SessionParams): Promise<GetSessionResult> {
    const session = await this.requireSession(params.sessionId);
    this.sendEvent(validatingStateEvent(params.sessionId, session));

    try {
      const client = this.restoreClient(session);
      this.attachClientEvents(client);

      await client.connect();
      this.clients.set(params.sessionId, client);

      const { toolCount } = await this.discoverAllCapabilities(params.sessionId, session.serverId ?? 'unknown');
      return {
        success: true,
        toolCount,
        protocolEra: client.getProtocolEra() ?? null,
        protocolVersion: client.getNegotiatedProtocolVersion() ?? null,
        discoverResult: client.getDiscoverResult() ?? null,
      };
    } catch (error) {
      this.sendEvent(connectionErrorEvent(params.sessionId, session.serverId, error, 'validation'));
      throw error;
    }
  }

  // -----------------------------------------------------------------------
  // Connection Lifecycle
  // -----------------------------------------------------------------------

  /**
   * Initiates a connection to a new MCP server.
   *
   * If a session for the same `serverId` or `serverUrl` already exists and
   * is still in a `pending` (OAuth) state, the existing session is resumed
   * instead of creating a duplicate.
   *
   * `UnauthorizedError` is treated as a pending-auth state and returned as
   * a successful result (the client will then redirect to the auth URL).
   */
  private async connect(params: ConnectParams): Promise<ConnectResult> {
    const headers  = normalizeHeaders(params.headers);
    const serverId = this.normalizeServerId(params.serverId);

    const existing = await this.findExistingSession(serverId, params.serverUrl);
    if (existing) {
      if (existing.status === 'pending') {
        return this.getSession({ sessionId: existing.sessionId }).then(() => ({
          sessionId: existing.sessionId,
          success: true,
        }));
      }
      throw new Error(
        `Connection already exists for server: ${existing.serverUrl ?? existing.serverId} (${existing.serverName})`,
      );
    }

    const sessionId = await sessions.generateSessionId();
    const metadata  = await this.getResolvedClientMetadata();
    const clientInformation = params.clientId
      ? {
          client_id: params.clientId,
          ...(params.clientSecret ? { client_secret: params.clientSecret } : {}),
        }
      : undefined;

    const client = new McpClient({
      userId:       this.userId,
      sessionId,
      serverId,
      serverName:   params.serverName,
      serverUrl:    params.serverUrl,
      callbackUrl:  params.callbackUrl,
      transport: params.transport,
      headers,
      clientInformation,
      sessionStore: this.observedStore,
      ...metadata,
    });

    this.cacheClient(sessionId, client);
    return this.connectAndDiscover(client, sessionId, serverId);
  }

  /**
   * Reconnects to an MCP server by tearing down the active transport if one
   * exists and instantiating a fresh connection, reusing the existing session
   * (and its stored credentials / DCR client info) from the database.
   */
  private async reconnect(params: ReconnectParams): Promise<ConnectResult> {
    const headers  = normalizeHeaders(params.headers);
    const serverId = this.normalizeServerId(params.serverId);

    const existing = await this.findExistingSession(serverId, params.serverUrl);
    const sessionId = existing ? existing.sessionId : await sessions.generateSessionId();

    if (existing) {
      const staleClient = this.clients.get(existing.sessionId);
      if (staleClient) {
        await staleClient.disconnect();
        this.clients.delete(existing.sessionId);
      }
    }

    const metadata = await this.getResolvedClientMetadata();
    const clientInformation = params.clientId
      ? {
          client_id: params.clientId,
          ...(params.clientSecret ? { client_secret: params.clientSecret } : {}),
        }
      : undefined;

    const client = new McpClient({
      userId:       this.userId,
      sessionId,
      serverId,
      serverName:   params.serverName,
      serverUrl:    params.serverUrl,
      callbackUrl:  params.callbackUrl,
      transport: params.transport,
      headers,
      clientInformation,
      sessionStore: this.observedStore,
      ...metadata,
    });

    this.cacheClient(sessionId, client);
    return this.connectAndDiscover(client, sessionId, serverId);
  }

  /**
   * Disconnects from an MCP server.
   *
   * If an active in-memory transport exists it delegates to `clearSession()`
   * (which sends the server an HTTP DELETE per the Streamable spec). If no
   * active transport is available (orphaned session from a failed OAuth flow),
   * the session row is removed directly from storage.
   */
  private async disconnect(params: DisconnectParams): Promise<DisconnectResult> {
    const client = this.clients.get(params.sessionId);
    if (client) {
      await client.clearSession();
      this.clients.delete(params.sessionId);
    } else {
      await sessions.delete(this.userId, params.sessionId);
    }
    return { success: true };
  }

  // -----------------------------------------------------------------------
  // OAuth
  // -----------------------------------------------------------------------

  /**
   * Completes the OAuth 2.1 authorization code flow for a pending session.
   *
   * Loads the stored session (with credentials), creates a fresh `McpClient`,
   * and calls `finishAuth` inside a {@link runWithCodeVerifierState} context
   * so the PKCE code verifier is available without a DB read.
   *
   * The session's stored `serverOptions` are passed through so restored clients
   * reuse the saved transport, SDK client options, and discover result.
   */
  private async finishAuth(params: FinishAuthParams): Promise<FinishAuthResult> {
    const parsed    = parseOAuthState(params.state);
    const sessionId = parsed?.sessionId ?? params.state;
    const session   = await this.requireSession(sessionId);

    try {
      const metadata = await this.getResolvedClientMetadata();

      const client = new McpClient({
        userId:       this.userId,
        sessionId,
        serverId:     session.serverId,
        serverName:   session.serverName,
        serverUrl:    session.serverUrl,
        callbackUrl:  session.callbackUrl,
        headers:      session.headers,
        oauthProvider: metadata.oauthProvider,
        hasSession:   true,
        cachedCredentials: { tokens: session.tokens ?? undefined },
        sessionStore: this.observedStore,
        ...metadata,
      });

      this.attachClientEvents(client);

      await runWithCodeVerifierState(session.codeVerifier ?? '', 'S256', () =>
        client.finishAuth(params.code, params.state, params.iss),
      );

      this.clients.set(sessionId, client);

      const { toolCount } = await this.discoverAllCapabilities(sessionId, session.serverId ?? 'unknown');
      return { success: true, toolCount: toolCount ?? 0 };
    } catch (error) {
      this.sendEvent(connectionErrorEvent(sessionId, session.serverId, error, 'auth'));
      throw error;
    }
  }

  // -----------------------------------------------------------------------
  // Tool Discovery & Policy
  // -----------------------------------------------------------------------

  /**
   * Returns all raw tools annotated with their effective policy state
   * for display in the management UI.
   */
  private async getToolPolicy(
    params: GetToolPolicyParams,
  ): Promise<GetToolPolicyResult> {
    const session = await this.requireSession(params.sessionId);
    const client  = await this.getOrCreateClient(params.sessionId);
    const allTools = await client.fetchTools();

    const policy = session.toolPolicy ?? {
      mode: 'all' as const,
      toolIds: [],
      updatedAt: session.updatedAt ?? session.createdAt,
    };

    const serverId = session.serverId ?? 'unknown';
    const tools = allTools.map((t) => ({
      ...t,
      toolId:  createToolId(serverId, t.name),
      allowed: isToolAllowed(policy, t.name, session.serverId),
    }));

    return {
      toolPolicy:        policy,
      tools,
      toolCount:         tools.length,
      allowedToolCount:  tools.filter((t) => t.allowed).length,
    };
  }

  /**
   * Returns the policy-filtered tool list for a session.
   */
  private async listTools(params: SessionParams): Promise<ListToolsRpcResult> {
    const client = await this.getOrCreateClient(params.sessionId);
    const gateway = createToolPolicyGateway(this.userId, params.sessionId, client);
    const result = await gateway.listTools({ filtered: true });
    return { tools: result.tools };
  }

  /**
   * Persists a new tool access policy and returns the updated filtered
   * tool list in the RPC response.
   *
   * @throws {Error} If the session does not exist or the policy references
   *                 tool IDs that don't match any known tool.
   */
  private async setToolPolicy(
    params: SetToolPolicyParams,
  ): Promise<SetToolPolicyResult> {
    const session = await this.requireSession(params.sessionId);
    const client  = await this.getOrCreateClient(params.sessionId);
    const allTools = await client.fetchTools();

    const policy = normalizeToolPolicyForUpdate(params.toolPolicy);
    validateToolPolicyAgainstTools(policy, allTools, session.serverId);
    await sessions.update(this.userId, params.sessionId, { toolPolicy: policy });

    const filtered = createToolPolicyGateway(
      this.userId, params.sessionId, client,
    ).filterTools({ ...session, toolPolicy: policy }, allTools);

    return { success: true, toolPolicy: policy, tools: filtered, toolCount: filtered.length };
  }

  /**
   * Enables or disables a session for agent tool discovery.
   *
   * Disabled sessions retain their OAuth tokens and connection metadata
   * but are hidden from `MultiSessionClient.connect()` and blocked from
   * RPC tool access. Re-enabling does not require re-authentication.
   *
   * @param params - `{ sessionId, enabled: boolean }`
   * @returns `{ success: true }`
   * @throws {Error} If the session does not exist.
   */
  private async updateSession(params: UpdateSessionParams): Promise<UpdateSessionResult> {
    await this.requireSession(params.sessionId);
    await sessions.update(this.userId, params.sessionId, { enabled: params.enabled });
    return { success: true };
  }

  // -----------------------------------------------------------------------
  // Tool Execution
  // -----------------------------------------------------------------------

  /**
   * Proxies a tool invocation to the remote MCP server.
   *
   * Resolves (or creates) the transport for the given session, runs the call
   * through the tool-policy gateway, and injects `sessionId` into the result
   * metadata so the client can route the response without scanning all sessions.
   */
  private async callTool(params: CallToolParams): Promise<CallToolResult> {
    const client = await this.getOrCreateClient(params.sessionId);
    const result = await createToolPolicyGateway(
      this.userId, params.sessionId, client,
    ).callTool(params.toolName, params.toolArgs);

    return { ...result, _meta: { ...(result._meta ?? {}), sessionId: params.sessionId } };
  }

  // -----------------------------------------------------------------------
  // Prompts
  // -----------------------------------------------------------------------

  /** Lists all prompts exposed by the remote MCP server. */
  private async listPrompts(params: SessionParams): Promise<ListPromptsResult> {
    const client = await this.getOrCreateClient(params.sessionId);
    const result = await client.listPrompts();
    return { prompts: result.prompts };
  }

  /** Retrieves a specific prompt by name with optional arguments. */
  private async getPrompt(params: GetPromptParams): Promise<unknown> {
    const client = await this.getOrCreateClient(params.sessionId);
    return client.getPrompt(params.name, params.args);
  }

  // -----------------------------------------------------------------------
  // Resources
  // -----------------------------------------------------------------------

  /** Lists all resources exposed by the remote MCP server. */
  private async listResources(params: SessionParams): Promise<ListResourcesResult> {
    const client = await this.getOrCreateClient(params.sessionId);
    const result = await client.listResources();
    return { resources: result.resources };
  }

  /** Lists all resource templates exposed by the remote MCP server. */
  private async listResourceTemplates(params: SessionParams): Promise<ListResourceTemplatesResult> {
    const client = await this.getOrCreateClient(params.sessionId);
    const result = await client.listResourceTemplates();
    return { resourceTemplates: result.resourceTemplates };
  }

  /** Reads a specific resource identified by URI. */
  private async readResource(params: ReadResourceParams): Promise<unknown> {
    const client = await this.getOrCreateClient(params.sessionId);
    return client.readResource(params.uri);
  }

  // -----------------------------------------------------------------------
  // Internal Helpers
  // -----------------------------------------------------------------------

  /** Resolves client metadata: `getClientMetadata()` → `clientDefaults` → `{}`. */
  private async getResolvedClientMetadata(request?: unknown): Promise<ClientMetadata> {
    let metadata: ClientMetadata = this.options.clientDefaults
      ? { ...this.options.clientDefaults }
      : {};

    if (this.options.getClientMetadata) {
      metadata = mergeClientMetadata(metadata, await this.options.getClientMetadata(request));
    }
    return metadata;
  }

  /** Ensures the given session exists in storage and throws otherwise. */
  private async requireSession(sessionId: string): Promise<Session> {
    const session = await sessions.get(this.userId, sessionId, { includeCredentials: true });
    if (!session) throw new Error(`Session ${sessionId} not found`);
    return session;
  }

  /** Finds an existing session matching the given serverId or serverUrl. */
  private async findExistingSession(
    serverId: string,
    serverUrl: string,
  ): Promise<Session | undefined> {
    const all = await sessions.list(this.userId);
    return all.find((s) => s.serverId === serverId || s.serverUrl === serverUrl);
  }

  /** Normalizes a serverId to max 12 chars (DeepSeek/OpenAI 64-char tool-name limit). */
  private normalizeServerId(raw?: string): string {
    return raw && raw.length <= 12 ? raw : generateServerId();
  }

  /**
   * Returns the cached in-memory transport for `sessionId`, or creates one
   * from the persisted session row (with credentials) and connects it.
   */
  private async getOrCreateClient(sessionId: string): Promise<McpClient> {
    const existing = this.clients.get(sessionId);
    if (existing) return existing;

    const pending = this.pendingClients.get(sessionId);
    if (pending) return pending;

    const promise = this.createClient(sessionId);
    this.pendingClients.set(sessionId, promise);

    try {
      const client = await promise;
      this.clients.set(sessionId, client);
      return client;
    } finally {
      this.pendingClients.delete(sessionId);
    }
  }

  private async createClient(sessionId: string): Promise<McpClient> {
    const session = await this.requireSession(sessionId);

    if (session.enabled === false) {
      throw new Error('Session is disabled — re-enable it via updateSession to access tools');
    }
    const metadata = await this.getResolvedClientMetadata();
    const client   = this.restoreClient(session, metadata);

    this.attachClientEvents(client);

    await client.connect();
    return client;
  }

  /**
   * Builds an `McpClient` from a stored session row.
   *
   * Extracts `clientId` and `clientSecret` from the session's credential
   * fields and passes `hasSession: true` + `cachedCredentials` so the client
   * can skip redundant existence checks and credential reads.
   */
  private restoreClient(session: Session, metadata?: ClientMetadata): McpClient {
    return new McpClient({
      userId:       this.userId,
      sessionId:     session.sessionId,
      serverId:      session.serverId,
      serverName:    session.serverName,
      serverUrl:     session.serverUrl,
      callbackUrl:   session.callbackUrl,
      transport: session.serverOptions?.transport,
      headers:       session.headers,
      oauthProvider: metadata?.oauthProvider,
      hasSession:    true,
      cachedCredentials: { tokens: session.tokens ?? undefined },
      clientInformation: session.clientInformation ?? (session.clientId ? { client_id: session.clientId } : undefined),
      serverOptions: session.serverOptions ?? undefined,
      discoverResult: session.serverOptions?.discoverResult ?? undefined,
      sessionStore:  this.observedStore,
      ...metadata,
      client: mergeMcpSdkClientOptions(session.serverOptions?.client, metadata?.client),
    });
  }

  /**
   * Wires connection and observability events from the client into the
   * unified observability channel. Connection events go to `sendEvent`
   * (SSE stream); observability events go to `emitObs` (user callback
   * + SSE stream).
   */
  private attachClientEvents(client: McpClient): void {
    client.onConnectionEvent((e) => this.sendEvent(e));
    client.onObservabilityEvent((e) => this.sendEvent(e));
  }

  /**
   * Registers the client in the in-memory cache and attaches its event
   * listeners to the unified observability channel.
   */
  private cacheClient(sessionId: string, client: McpClient): void {
    this.attachClientEvents(client);
    this.clients.set(sessionId, client);
  }

  /**
   * Attempts a `client.connect()` and, on success, discovers tools.
   *
   * If the server responds with `UnauthorizedError`, the session is
   * treated as pending OAuth — a successful result is returned with
   * the sessionId so the browser client can redirect to the auth URL.
   *
   * For any other error an `error` connection event is emitted and the
   * client is removed from the in-memory cache before re-throwing.
   */
  private async connectAndDiscover(
    client: McpClient,
    sessionId: string,
    serverId: string,
  ): Promise<ConnectResult> {
    try {
      await client.connect();
      await this.discoverAllCapabilities(sessionId, serverId);
      return { sessionId, success: true };
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        this.clients.delete(sessionId);
        return { sessionId, success: true };
      }

      this.sendEvent(connectionErrorEvent(sessionId, serverId, error, 'connection'));
      this.clients.delete(sessionId);
      throw error;
    }
  }

  /**
   * Discovers all capabilities (tools, prompts, resources, resource templates)
   * from the remote MCP server and emits a single `capabilities_discovered` event.
   *
   * Tools are passed through the tool-policy gateway so the emitted list
   * respects the session's allow/deny policy.
   */
  private async discoverAllCapabilities(
    sessionId: string,
    serverId: string,
  ): Promise<{ toolCount: number }> {
    const client = this.clients.get(sessionId);
    if (!client) return { toolCount: 0 };

    const rawCaps = await client.discoverCapabilities();

    const gateway = createToolPolicyGateway(this.userId, sessionId, client);
    const filteredResult = await gateway.listTools();

    this.sendEvent({
      type: 'capabilities_discovered',
      sessionId,
      serverId,
      tools: filteredResult.tools,
      allTools: rawCaps.tools,
      prompts: rawCaps.prompts,
      resources: rawCaps.resources,
      resourceTemplates: rawCaps.resourceTemplates,
      timestamp: Date.now(),
    });

    return { toolCount: filteredResult.tools.length };
  }

  /** Starts the periodic heartbeat timer. */
  private startHeartbeat(): void {
    const ms = this.options.heartbeatInterval ?? DEFAULT_HEARTBEAT_MS;
    this.heartbeatTimer = setInterval(() => {
      if (this.active) {
        this.sendEvent({ level: 'debug', message: 'heartbeat', timestamp: Date.now() });
      }
    }, ms);
  }
}

// ---------------------------------------------------------------------------
// SSE Handler Factory
// ---------------------------------------------------------------------------

/**
 * Creates a Node.js-compatible HTTP handler that serves an SSE stream (GET)
 * and accepts RPC calls (POST) for a single browser client.
 *
 * @example
 * ```ts
 * import { createSSEHandler } from '@mcp-ts/sdk/server';
 *
 * const handler = createSSEHandler({ userId: 'user-123' });
 * // Mount `handler` on both GET and POST for your HTTP framework.
 * ```
 *
 * @param options - Handler configuration (userId, optional auth check, metadata).
 * @returns An async function `(req, res) => void` suitable as an HTTP handler.
 */
export function createSSEHandler(options: SSEHandlerOptions) {
  return async (
    req: { method?: string; on: (event: string, cb: (...args: any[]) => void) => void },
    res: { writeHead: (status: number, headers: Record<string, string>) => void; write: (chunk: string) => void },
  ) => {
    res.writeHead(200, {
      'Content-Type':              'text/event-stream',
      'Cache-Control':             'no-cache',
      'Connection':                'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    writeSSEEvent(res, 'connected', { timestamp: Date.now() });

    const manager = new SSEConnectionManager(options, (event) => {
      if (isRpcResponseEvent(event)) {
        writeSSEEvent(res, 'rpc-response', event);
      } else if (isConnectionEvent(event)) {
        writeSSEEvent(res, 'connection', event);
      } else {
        writeSSEEvent(res, 'observability', event);
      }
    });

    req.on('close', () => manager.dispose());

    if (req.method === 'POST') {
      let body = '';
      req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
      req.on('end', async () => {
        try {
          await manager.handleRequest(JSON.parse(body) as McpRpcRequest);
        } catch {
          // Parsing / handling errors surface through SSE error events
        }
      });
    }
  };
}

// ---------------------------------------------------------------------------
// SSE Utilities
// ---------------------------------------------------------------------------

/**
 * Writes a single SSE event frame onto the response stream.
 *
 * Format: `event: <type>\ndata: <json>\n\n`
 */
function writeSSEEvent(
  res: { write: (chunk: string) => void },
  event: string,
  data: unknown,
): void {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}
