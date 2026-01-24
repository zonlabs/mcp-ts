/**
 * SSE (Server-Sent Events) Handler for MCP Connections
 * Provides real-time connection state updates to clients
 * Based on Cloudflare's agents pattern but adapted for HTTP/SSE
 */

import type { McpConnectionEvent, McpObservabilityEvent } from '../shared/events';
import type {
  McpRpcRequest,
  McpRpcResponse,
  // RPC Param types
  ConnectParams,
  DisconnectParams,
  SessionParams,
  CallToolParams,
  GetPromptParams,
  ReadResourceParams,
  FinishAuthParams,
  // RPC Result types
  SessionListResult,
  ConnectResult,
  DisconnectResult,
  RestoreSessionResult,
  FinishAuthResult,
  ListToolsRpcResult,
  ListPromptsResult,
  ListResourcesResult,
} from '../shared/types';
import { RpcErrorCodes } from '../shared/errors';
import { MCPClient } from './oauth-client';
import { sessionStore } from './session-store';

export interface ClientMetadata {
  clientName?: string;
  clientUri?: string;
  logoUri?: string;
  policyUri?: string;
}

export interface SSEHandlerOptions {
  /**
   * User/Client identifier
   */
  identity: string;

  /**
   * Optional callback for authentication/authorization
   */
  onAuth?: (identity: string) => Promise<boolean>;

  /**
   * Heartbeat interval in ms (default: 30000)
   */
  heartbeatInterval?: number;

  /**
   * Static OAuth client metadata defaults (for all connections)
   */
  clientDefaults?: ClientMetadata;

  /**
   * Dynamic OAuth client metadata getter (per-request, useful for multi-tenant)
   * Takes precedence over clientDefaults
   */
  getClientMetadata?: (request?: any) => ClientMetadata | Promise<ClientMetadata>;
}

/**
 * SSE Connection Manager
 * Handles a single SSE connection and manages MCP operations
 */
export class SSEConnectionManager {
  private identity: string;
  private clients: Map<string, MCPClient> = new Map();
  private heartbeatTimer?: NodeJS.Timeout;
  private isActive: boolean = true;

  constructor(
    private options: SSEHandlerOptions,
    private sendEvent: (event: McpConnectionEvent | McpObservabilityEvent | McpRpcResponse) => void
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
    const interval = this.options.heartbeatInterval || 30000;
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
   */
  async handleRequest(request: McpRpcRequest): Promise<void> {
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

      this.sendEvent({
        id: request.id,
        result,
      });
    } catch (error) {
      this.sendEvent({
        id: request.id,
        error: {
          code: RpcErrorCodes.EXECUTION_ERROR,
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      });
    }
  }

  /**
   * Get all user sessions
   */
  private async getSessions(): Promise<SessionListResult> {
    const sessions = await sessionStore.getIdentitySessionsData(this.identity);

    this.sendEvent({
      level: 'debug',
      message: `Retrieved ${sessions.length} sessions for identity ${this.identity}`,
      timestamp: Date.now(),
      metadata: {
        identity: this.identity,
        sessionCount: sessions.length,
        sessions: sessions.map(s => ({
          sessionId: s.sessionId,
          serverId: s.serverId,
          serverName: s.serverName,
          active: s.active,
        })),
      },
    });

    return {
      sessions: sessions.map((s) => ({
        sessionId: s.sessionId,
        serverId: s.serverId,
        serverName: s.serverName,
        serverUrl: s.serverUrl,
        transport: s.transportType,
        active: s.active,
      })),
    };
  }

  /**
   * Connect to an MCP server
   */
  private async connect(params: ConnectParams): Promise<ConnectResult> {
    const { serverId, serverName, serverUrl, callbackUrl, transportType } = params;

    // Generate session ID
    const sessionId = sessionStore.generateSessionId();

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

      // Emit connected state - Handled by client event


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
    }

    return { success: true };
  }

  /**
   * Helper to get or restore a client
   */
  private async getOrCreateClient(sessionId: string): Promise<MCPClient> {
    let client = this.clients.get(sessionId);

    if (!client) {
      client = new MCPClient({
        identity: this.identity,
        sessionId,
      });

      // Subscribe to events
      client.onConnectionEvent((event) => {
        this.emitConnectionEvent(event);
      });

      client.onObservabilityEvent((event) => {
        this.sendEvent(event);
      });

      await client.connect();
      this.clients.set(sessionId, client);
    }

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
   * Call a tool
   */
  private async callTool(params: CallToolParams): Promise<unknown> {
    const { sessionId, toolName, toolArgs } = params;
    const client = await this.getOrCreateClient(sessionId);
    return await client.callTool(toolName, toolArgs);
  }

  /**
   * Refresh/validate a session
   */
  private async restoreSession(params: SessionParams): Promise<RestoreSessionResult> {
    const { sessionId } = params;

    this.sendEvent({
      level: 'debug',
      message: `Starting session refresh for ${sessionId}`,
      timestamp: Date.now(),
      metadata: { sessionId, identity: this.identity },
    });

    // Emit validating state
    const session = await sessionStore.getSession(this.identity, sessionId);
    if (!session) {
      this.sendEvent({
        level: 'error',
        message: `Session not found: ${sessionId}`,
        timestamp: Date.now(),
        metadata: { sessionId, identity: this.identity },
      });
      throw new Error('Session not found');
    }

    this.sendEvent({
      level: 'debug',
      message: `Session found in Redis`,
      timestamp: Date.now(),
      metadata: {
        sessionId,
        serverId: session.serverId,
        serverName: session.serverName,
        serverUrl: session.serverUrl,
        transportType: session.transportType,
        active: session.active,
      },
    });

    this.emitConnectionEvent({
      type: 'state_changed',
      sessionId,
      serverId: session.serverId || 'unknown',
      serverName: session.serverName || 'Unknown',
      state: 'VALIDATING',
      previousState: 'DISCONNECTED',
      timestamp: Date.now(),
    });

    try {
      // Get resolved client metadata
      const clientMetadata = await this.getResolvedClientMetadata();

      // Try to restore and validate
      const client = new MCPClient({
        identity: this.identity,
        sessionId,
        ...clientMetadata, // Include metadata for consistency
      });

      // Subscribe to events
      client.onConnectionEvent((event) => {
        this.emitConnectionEvent(event);
      });

      client.onObservabilityEvent((event) => {
        this.sendEvent(event);
      });

      await client.connect();
      this.clients.set(sessionId, client);

      const tools = await client.listTools();



      this.emitConnectionEvent({
        type: 'tools_discovered',
        sessionId,
        serverId: session.serverId || 'unknown',
        toolCount: tools.tools.length,
        tools: tools.tools,
        timestamp: Date.now(),
      });

      return { success: true, toolCount: tools.tools.length };
    } catch (error) {
      this.emitConnectionEvent({
        type: 'error',
        sessionId,
        serverId: session.serverId || 'unknown',
        error: error instanceof Error ? error.message : 'Validation failed',
        errorType: 'validation',
        timestamp: Date.now(),
      });

      throw error;
    }
  }

  /**
   * Complete OAuth authorization
   */
  private async finishAuth(params: FinishAuthParams): Promise<FinishAuthResult> {
    const { sessionId, code } = params;

    this.sendEvent({
      level: 'debug',
      message: `Completing OAuth for session ${sessionId}`,
      timestamp: Date.now(),
      metadata: { sessionId, identity: this.identity },
    });

    const session = await sessionStore.getSession(this.identity, sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    this.emitConnectionEvent({
      type: 'state_changed',
      sessionId,
      serverId: session.serverId || 'unknown',
      serverName: session.serverName || 'Unknown',
      state: 'AUTHENTICATING',
      previousState: 'DISCONNECTED',
      timestamp: Date.now(),
    });

    try {
      const client = new MCPClient({
        identity: this.identity,
        sessionId,
      });

      // Subscribe to events
      client.onConnectionEvent((event) => {
        this.emitConnectionEvent(event);
      });

      await client.finishAuth(code);
      this.clients.set(sessionId, client);

      const tools = await client.listTools();



      this.emitConnectionEvent({
        type: 'tools_discovered',
        sessionId,
        serverId: session.serverId || 'unknown',
        toolCount: tools.tools.length,
        tools: tools.tools,
        timestamp: Date.now(),
      });

      return { success: true, toolCount: tools.tools.length };
    } catch (error) {
      this.emitConnectionEvent({
        type: 'error',
        sessionId,
        serverId: session.serverId || 'unknown',
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
    return await client.readResource(uri);
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

/**
 * Create SSE endpoint handler
 * Compatible with various Node.js frameworks
 */
export function createSSEHandler(options: SSEHandlerOptions) {
  return async (req: any, res: any) => {
    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    // Send initial connection event
    sendSSE(res, 'connected', { timestamp: Date.now() });

    // Create connection manager
    const manager = new SSEConnectionManager(options, (event) => {
      // Determine event type
      if ('id' in event) {
        // RPC response
        sendSSE(res, 'rpc-response', event);
      } else if ('type' in event && 'sessionId' in event) {
        // Connection event
        sendSSE(res, 'connection', event);
      } else {
        // Observability event
        sendSSE(res, 'observability', event);
      }
    });

    // Handle client disconnect
    req.on('close', () => {
      manager.dispose();
    });

    // Handle incoming messages (if using POST body or other methods)
    if (req.method === 'POST') {
      let body = '';
      req.on('data', (chunk: Buffer) => {
        body += chunk.toString();
      });
      req.on('end', async () => {
        try {
          const request: McpRpcRequest = JSON.parse(body);
          await manager.handleRequest(request);
        } catch (error) {
          console.error('[SSE] Error handling request:', error);
        }
      });
    }
  };
}

/**
 * Send SSE event
 */
function sendSSE(res: any, event: string, data: any): void {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}
