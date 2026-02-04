/**
 * SSE (Server-Sent Events) Handler for MCP Connections
 *
 * Manages real-time bidirectional communication with MCP clients:
 * - SSE stream for server → client events (connection state, tools, logs)
 * - HTTP POST for client → server RPC requests
 *
 * Key features:
 * - Direct HTTP response for RPC calls (bypasses SSE latency)
 * - Automatic session restoration and validation
 * - OAuth 2.1 authentication flow support
 * - Heartbeat to keep connections alive
 */

import type { McpConnectionEvent, McpObservabilityEvent } from '../../shared/events.js';
import type {
  McpRpcRequest,
  McpRpcResponse,
  ConnectParams,
  DisconnectParams,
  SessionParams,
  CallToolParams,
  GetPromptParams,
  ReadResourceParams,
  FinishAuthParams,
  SessionListResult,
  ConnectResult,
  DisconnectResult,
  RestoreSessionResult,
  FinishAuthResult,
  ListToolsRpcResult,
  ListPromptsResult,
  ListResourcesResult,
  CallToolResult,
} from '../../shared/types.js';
import { RpcErrorCodes } from '../../shared/errors.js';
import { MCPClient } from '../mcp/oauth-client.js';
import { storage } from '../storage/index.js';

// ============================================
// Types & Interfaces
// ============================================

export interface ClientMetadata {
  clientName?: string;
  clientUri?: string;
  logoUri?: string;
  policyUri?: string;
}

export interface SSEHandlerOptions {
  /** User/Client identifier */
  identity: string;

  /** Optional callback for authentication/authorization */
  onAuth?: (identity: string) => Promise<boolean>;

  /** Heartbeat interval in milliseconds @default 30000 */
  heartbeatInterval?: number;

  /** Static OAuth client metadata defaults (for all connections) */
  clientDefaults?: ClientMetadata;

  /** Dynamic OAuth client metadata getter (per-request, useful for multi-tenant) */
  getClientMetadata?: (request?: unknown) => ClientMetadata | Promise<ClientMetadata>;
}

// ============================================
// Constants
// ============================================

const DEFAULT_HEARTBEAT_INTERVAL = 30000;

// ============================================
// SSEConnectionManager Class
// ============================================

/**
 * Manages a single SSE connection and handles MCP operations.
 * Each instance corresponds to one connected browser client.
 */
export class SSEConnectionManager {
  private readonly identity: string;
  private readonly clients = new Map<string, MCPClient>();
  private heartbeatTimer?: NodeJS.Timeout;
  private isActive = true;

  constructor(
    private readonly options: SSEHandlerOptions,
    private readonly sendEvent: (event: McpConnectionEvent | McpObservabilityEvent | McpRpcResponse) => void
  ) {
    this.identity = options.identity;
    this.startHeartbeat();
  }

  /**
   * Get resolved client metadata (dynamic > static > defaults)
   */
  private async getResolvedClientMetadata(request?: any): Promise<ClientMetadata> {
    // Priority: getClientMetadata() > clientDefaults > empty object
    let metadata: ClientMetadata = {};

    // Start with static defaults
    if (this.options.clientDefaults) {
      metadata = { ...this.options.clientDefaults };
    }

    // Override with dynamic metadata if provided
    if (this.options.getClientMetadata) {
      const dynamicMetadata = await this.options.getClientMetadata(request);
      metadata = { ...metadata, ...dynamicMetadata };
    }

    return metadata;
  }

  /**
   * Start heartbeat to keep connection alive
   */
  private startHeartbeat(): void {
    const interval = this.options.heartbeatInterval ?? DEFAULT_HEARTBEAT_INTERVAL;
    this.heartbeatTimer = setInterval(() => {
      if (this.isActive) {
        this.sendEvent({
          level: 'debug',
          message: 'heartbeat',
          timestamp: Date.now(),
        } as McpObservabilityEvent);
      }
    }, interval);
  }

  /**
   * Handle incoming RPC requests
   * Returns the RPC response directly for immediate HTTP response (bypassing SSE latency)
   */
  async handleRequest(request: McpRpcRequest): Promise<McpRpcResponse> {
    try {
      let result: SessionListResult | ConnectResult | DisconnectResult | RestoreSessionResult | FinishAuthResult | ListToolsRpcResult | ListPromptsResult | ListResourcesResult | unknown;

      switch (request.method) {
        case 'getSessions':
          result = await this.getSessions();
          break;

        case 'connect':
          result = await this.connect(request.params as ConnectParams);
          break;

        case 'disconnect':
          result = await this.disconnect(request.params as DisconnectParams);
          break;

        case 'listTools':
          result = await this.listTools(request.params as SessionParams);
          break;

        case 'callTool':
          result = await this.callTool(request.params as CallToolParams);
          break;

        case 'restoreSession':
          result = await this.restoreSession(request.params as SessionParams);
          break;

        case 'finishAuth':
          result = await this.finishAuth(request.params as FinishAuthParams);
          break;

        case 'listPrompts':
          result = await this.listPrompts(request.params as SessionParams);
          break;

        case 'getPrompt':
          result = await this.getPrompt(request.params as GetPromptParams);
          break;

        case 'listResources':
          result = await this.listResources(request.params as SessionParams);
          break;

        case 'readResource':
          result = await this.readResource(request.params as ReadResourceParams);
          break;

        default:
          throw new Error(`Unknown method: ${request.method}`);
      }

      const response: McpRpcResponse = {
        id: request.id,
        result,
      };

      // Also send via SSE for backwards compatibility
      this.sendEvent(response);

      return response;
    } catch (error) {
      const errorResponse: McpRpcResponse = {
        id: request.id,
        error: {
          code: RpcErrorCodes.EXECUTION_ERROR,
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      };

      // Also send via SSE for backwards compatibility
      this.sendEvent(errorResponse);

      return errorResponse;
    }
  }

  /**
   * Get all sessions for the current identity
   */
  private async getSessions(): Promise<SessionListResult> {
    const sessions = await storage.getIdentitySessionsData(this.identity);

    return {
      sessions: sessions.map((s) => ({
        sessionId: s.sessionId,
        serverId: s.serverId,
        serverName: s.serverName,
        serverUrl: s.serverUrl,
        transport: s.transportType,
      })),
    };
  }

  /**
   * Connect to an MCP server
   */
  private async connect(params: ConnectParams): Promise<ConnectResult> {
    const { serverName, serverUrl, callbackUrl, transportType } = params;

    // generate serverId on server-side if not provided
    const serverId = params.serverId || await storage.generateSessionId(); // we use serverid as session id internally to track individual connections.

    // Check for existing connections
    const existingSessions = await storage.getIdentitySessionsData(this.identity);
    const duplicate = existingSessions.find(s =>
      s.serverId === serverId || s.serverUrl === serverUrl
    );

    if (duplicate) {
      throw new Error(`Connection already exists for server: ${duplicate.serverUrl || duplicate.serverId} (${duplicate.serverName})`);
    }

    // Generate session ID
    const sessionId = await storage.generateSessionId();

    // Emit connecting state
    this.emitConnectionEvent({
      type: 'state_changed',
      sessionId,
      serverId,
      serverName,
      state: 'CONNECTING',
      previousState: 'DISCONNECTED',
      timestamp: Date.now(),
    });

    try {
      // Get resolved client metadata
      const clientMetadata = await this.getResolvedClientMetadata();

      // Create MCP client
      const client = new MCPClient({
        identity: this.identity,
        sessionId,
        serverId,
        serverName,
        serverUrl,
        callbackUrl,
        transportType,
        ...clientMetadata, // Spread client metadata (clientName, clientUri, logoUri, policyUri)
        onRedirect: (authUrl) => {
          // Emit auth required event
          this.emitConnectionEvent({
            type: 'auth_required',
            sessionId,
            serverId,
            authUrl,
            timestamp: Date.now(),
          });
        },
      });

      // Note: Session will be created by MCPClient after successful connection
      // This ensures sessions only exist for successful or OAuth-pending connections

      // Store client
      this.clients.set(sessionId, client);

      // Subscribe to client events
      client.onConnectionEvent((event) => {
        this.emitConnectionEvent(event);
      });

      client.onObservabilityEvent((event) => {
        this.sendEvent(event);
      });

      // Attempt connection
      await client.connect();

      // Fetch tools
      const tools = await client.listTools();

      this.emitConnectionEvent({
        type: 'tools_discovered',
        sessionId,
        serverId,
        toolCount: tools.tools.length,
        tools: tools.tools,
        timestamp: Date.now(),
      });

      return {
        sessionId,
        success: true,
      };
    } catch (error) {
      this.emitConnectionEvent({
        type: 'error',
        sessionId,
        serverId,
        error: error instanceof Error ? error.message : 'Connection failed',
        errorType: 'connection',
        timestamp: Date.now(),
      });

      // Clean up client
      this.clients.delete(sessionId);

      throw error;
    }
  }

  /**
   * Disconnect from an MCP server
   */
  private async disconnect(params: DisconnectParams): Promise<DisconnectResult> {
    const { sessionId } = params;
    const client = this.clients.get(sessionId);

    if (client) {
      await client.clearSession();
      client.disconnect();
      this.clients.delete(sessionId);
    } else {
      // Handle orphaned sessions (e.g., OAuth flow failed before client was stored)
      // Directly remove from storage since there's no active client
      await storage.removeSession(this.identity, sessionId);
    }

    return { success: true };
  }

  /**
   * Get an existing client or create and connect a new one for the session.
   */
  private async getOrCreateClient(sessionId: string): Promise<MCPClient> {
    const existing = this.clients.get(sessionId);
    if (existing) {
      return existing;
    }

    const client = new MCPClient({
      identity: this.identity,
      sessionId,
    });

    // Subscribe to events before connecting
    client.onConnectionEvent((event) => this.emitConnectionEvent(event));
    client.onObservabilityEvent((event) => this.sendEvent(event));

    await client.connect();
    this.clients.set(sessionId, client);

    return client;
  }

  /**
   * List tools from a session
   */
  private async listTools(params: SessionParams): Promise<ListToolsRpcResult> {
    const { sessionId } = params;
    const client = await this.getOrCreateClient(sessionId);
    const result = await client.listTools();
    return { tools: result.tools };
  }

  /**
   * Call a tool on the MCP server
   */
  private async callTool(params: CallToolParams): Promise<CallToolResult> {
    const { sessionId, toolName, toolArgs } = params;
    const client = await this.getOrCreateClient(sessionId);
    const result = await client.callTool(toolName, toolArgs);

    // Inject sessionId into meta so client knows who handled it
    // This allows AppHost to auto-launch without scanning all sessions
    const meta = result._meta || {};

    return {
      ...result,
      _meta: {
        ...meta,
        sessionId,
      }
    };
  }

  /**
   * Restore and validate an existing session
   */
  private async restoreSession(params: SessionParams): Promise<RestoreSessionResult> {
    const { sessionId } = params;

    const session = await storage.getSession(this.identity, sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    this.emitConnectionEvent({
      type: 'state_changed',
      sessionId,
      serverId: session.serverId ?? 'unknown',
      serverName: session.serverName ?? 'Unknown',
      state: 'VALIDATING',
      previousState: 'DISCONNECTED',
      timestamp: Date.now(),
    });

    try {
      const clientMetadata = await this.getResolvedClientMetadata();

      const client = new MCPClient({
        identity: this.identity,
        sessionId,
        ...clientMetadata,
      });

      client.onConnectionEvent((event) => this.emitConnectionEvent(event));
      client.onObservabilityEvent((event) => this.sendEvent(event));

      await client.connect();
      this.clients.set(sessionId, client);

      const tools = await client.listTools();

      this.emitConnectionEvent({
        type: 'tools_discovered',
        sessionId,
        serverId: session.serverId ?? 'unknown',
        toolCount: tools.tools.length,
        tools: tools.tools,
        timestamp: Date.now(),
      });

      return { success: true, toolCount: tools.tools.length };
    } catch (error) {
      this.emitConnectionEvent({
        type: 'error',
        sessionId,
        serverId: session.serverId ?? 'unknown',
        error: error instanceof Error ? error.message : 'Validation failed',
        errorType: 'validation',
        timestamp: Date.now(),
      });

      throw error;
    }
  }

  /**
   * Complete OAuth authorization flow
   */
  private async finishAuth(params: FinishAuthParams): Promise<FinishAuthResult> {
    const { sessionId, code } = params;

    const session = await storage.getSession(this.identity, sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    this.emitConnectionEvent({
      type: 'state_changed',
      sessionId,
      serverId: session.serverId ?? 'unknown',
      serverName: session.serverName ?? 'Unknown',
      state: 'AUTHENTICATING',
      previousState: 'DISCONNECTED',
      timestamp: Date.now(),
    });

    try {
      const client = new MCPClient({
        identity: this.identity,
        sessionId,
      });

      client.onConnectionEvent((event) => this.emitConnectionEvent(event));

      await client.finishAuth(code);
      this.clients.set(sessionId, client);

      const tools = await client.listTools();

      this.emitConnectionEvent({
        type: 'tools_discovered',
        sessionId,
        serverId: session.serverId ?? 'unknown',
        toolCount: tools.tools.length,
        tools: tools.tools,
        timestamp: Date.now(),
      });

      return { success: true, toolCount: tools.tools.length };
    } catch (error) {
      this.emitConnectionEvent({
        type: 'error',
        sessionId,
        serverId: session.serverId ?? 'unknown',
        error: error instanceof Error ? error.message : 'OAuth completion failed',
        errorType: 'auth',
        timestamp: Date.now(),
      });

      throw error;
    }
  }

  /**
   * List prompts from a session
   */
  private async listPrompts(params: SessionParams): Promise<ListPromptsResult> {
    const { sessionId } = params;
    const client = await this.getOrCreateClient(sessionId);
    const result = await client.listPrompts();
    return { prompts: result.prompts };
  }

  /**
   * Get a specific prompt
   */
  private async getPrompt(params: GetPromptParams): Promise<unknown> {
    const { sessionId, name, args } = params;
    const client = await this.getOrCreateClient(sessionId);
    return await client.getPrompt(name, args);
  }

  /**
   * List resources from a session
   */
  private async listResources(params: SessionParams): Promise<ListResourcesResult> {
    const { sessionId } = params;
    const client = await this.getOrCreateClient(sessionId);
    const result = await client.listResources();
    return { resources: result.resources };
  }

  /**
   * Read a specific resource
   */
  private async readResource(params: ReadResourceParams): Promise<unknown> {
    const { sessionId, uri } = params;
    const client = await this.getOrCreateClient(sessionId);
    return client.readResource(uri);
  }

  /**
   * Emit connection event
   */
  private emitConnectionEvent(event: McpConnectionEvent): void {
    this.sendEvent(event);
  }

  /**
   * Cleanup and close all connections
   */
  dispose(): void {
    this.isActive = false;

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }

    for (const client of this.clients.values()) {
      client.disconnect();
    }

    this.clients.clear();
  }
}

// ============================================
// SSE Handler Factory
// ============================================

/**
 * Create an SSE endpoint handler compatible with Node.js HTTP frameworks.
 * Handles both SSE streaming (GET) and RPC requests (POST).
 */
export function createSSEHandler(options: SSEHandlerOptions) {
  return async (req: { method?: string; on: Function }, res: { writeHead: Function; write: Function }) => {
    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    // Send initial connection acknowledgment
    writeSSEEvent(res, 'connected', { timestamp: Date.now() });

    // Create connection manager with event routing
    const manager = new SSEConnectionManager(options, (event) => {
      if ('id' in event) {
        writeSSEEvent(res, 'rpc-response', event);
      } else if ('type' in event && 'sessionId' in event) {
        writeSSEEvent(res, 'connection', event);
      } else {
        writeSSEEvent(res, 'observability', event);
      }
    });

    // Cleanup on client disconnect
    req.on('close', () => manager.dispose());

    // Handle RPC requests via POST
    if (req.method === 'POST') {
      let body = '';
      req.on('data', (chunk: Buffer) => {
        body += chunk.toString();
      });
      req.on('end', async () => {
        try {
          const request: McpRpcRequest = JSON.parse(body);
          await manager.handleRequest(request);
        } catch {
          // Request parsing/handling errors are sent via SSE error events
        }
      });
    }
  };
}

// ============================================
// Utilities
// ============================================

/**
 * Write an SSE event to the response stream
 */
function writeSSEEvent(res: { write: Function }, event: string, data: unknown): void {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}
