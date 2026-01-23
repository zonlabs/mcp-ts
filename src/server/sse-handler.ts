/**
 * SSE (Server-Sent Events) Handler for MCP Connections
 * Provides real-time connection state updates to clients
 * Based on Cloudflare's agents pattern but adapted for HTTP/SSE
 */

import type { McpConnectionEvent, McpObservabilityEvent } from '../shared/events';
import type { McpRpcRequest, McpRpcResponse } from '../shared/types';
import { MCPClient } from './oauth-client';
import { sessionStore } from './session-store';

export interface SSEHandlerOptions {
  /**
   * User ID for authentication
   */
  userId: string;

  /**
   * Optional callback for authentication/authorization
   */
  onAuth?: (userId: string) => Promise<boolean>;

  /**
   * Heartbeat interval in ms (default: 30000)
   */
  heartbeatInterval?: number;
}

/**
 * SSE Connection Manager
 * Handles a single SSE connection and manages MCP operations
 */
export class SSEConnectionManager {
  private userId: string;
  private clients: Map<string, MCPClient> = new Map();
  private heartbeatTimer?: NodeJS.Timeout;
  private isActive: boolean = true;

  constructor(
    private options: SSEHandlerOptions,
    private sendEvent: (event: McpConnectionEvent | McpObservabilityEvent | McpRpcResponse) => void
  ) {
    this.userId = options.userId;
    this.startHeartbeat();
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
      let result: any;

      switch (request.method) {
        case 'getSessions':
          result = await this.getSessions();
          break;

        case 'connect':
          result = await this.connect(request.params);
          break;

        case 'disconnect':
          result = await this.disconnect(request.params);
          break;

        case 'listTools':
          result = await this.listTools(request.params);
          break;

        case 'callTool':
          result = await this.callTool(request.params);
          break;

        case 'restoreSession':
          result = await this.restoreSession(request.params);
          break;

        case 'finishAuth':
          result = await this.finishAuth(request.params);
          break;

        case 'listPrompts':
          result = await this.listPrompts(request.params);
          break;

        case 'getPrompt':
          result = await this.getPrompt(request.params);
          break;

        case 'listResources':
          result = await this.listResources(request.params);
          break;

        case 'readResource':
          result = await this.readResource(request.params);
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
          code: 'EXECUTION_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      });
    }
  }

  /**
   * Get all user sessions
   */
  private async getSessions(): Promise<any> {
    const sessions = await sessionStore.getUserSessionsData(this.userId);

    this.sendEvent({
      level: 'debug',
      message: `Retrieved ${sessions.length} sessions for user ${this.userId}`,
      timestamp: Date.now(),
      metadata: {
        userId: this.userId,
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
  private async connect(params: {
    serverId: string;
    serverName: string;
    serverUrl: string;
    callbackUrl: string;
    transportType?: 'sse' | 'streamable_http';
  }): Promise<any> {
    const { serverId, serverName, serverUrl, callbackUrl, transportType = 'sse' } = params;

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
      // Create MCP client
      const client = new MCPClient({
        userId: this.userId,
        sessionId,
        serverId,
        serverName,
        serverUrl,
        callbackUrl,
        transportType,
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

      // Emit connected state
      this.emitConnectionEvent({
        type: 'state_changed',
        sessionId,
        serverId,
        serverName,
        state: 'CONNECTED',
        previousState: 'CONNECTING',
        timestamp: Date.now(),
      });

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
  private async disconnect(params: { sessionId: string }): Promise<any> {
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
   * List tools from a session
   */
  private async listTools(params: { sessionId: string }): Promise<any> {
    const { sessionId } = params;
    let client = this.clients.get(sessionId);

    // If client not in memory, try to restore from session
    if (!client) {
      client = new MCPClient({
        userId: this.userId,
        sessionId,
      });
      await client.connect();
      this.clients.set(sessionId, client);
    }

    const result = await client.listTools();
    return { tools: result.tools };
  }

  /**
   * Call a tool
   */
  private async callTool(params: {
    sessionId: string;
    toolName: string;
    toolArgs: Record<string, unknown>;
  }): Promise<any> {
    const { sessionId, toolName, toolArgs } = params;
    let client = this.clients.get(sessionId);

    // If client not in memory, try to restore from session
    if (!client) {
      client = new MCPClient({
        userId: this.userId,
        sessionId,
      });
      await client.connect();
      this.clients.set(sessionId, client);
    }

    const result = await client.callTool(toolName, toolArgs);
    return result;
  }

  /**
   * Refresh/validate a session
   */
  private async restoreSession(params: { sessionId: string }): Promise<any> {
    const { sessionId } = params;

    this.sendEvent({
      level: 'debug',
      message: `Starting session refresh for ${sessionId}`,
      timestamp: Date.now(),
      metadata: { sessionId, userId: this.userId },
    });

    // Emit validating state
    const session = await sessionStore.getSession(this.userId, sessionId);
    if (!session) {
      this.sendEvent({
        level: 'error',
        message: `Session not found: ${sessionId}`,
        timestamp: Date.now(),
        metadata: { sessionId, userId: this.userId },
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
      // Try to restore and validate
      const client = new MCPClient({
        userId: this.userId,
        sessionId,
      });

      await client.connect();
      this.clients.set(sessionId, client);

      // Subscribe to events
      client.onConnectionEvent((event) => {
        this.emitConnectionEvent(event);
      });

      const tools = await client.listTools();

      this.emitConnectionEvent({
        type: 'state_changed',
        sessionId,
        serverId: session.serverId || 'unknown',
        serverName: session.serverName || 'Unknown',
        state: 'CONNECTED',
        previousState: 'VALIDATING',
        timestamp: Date.now(),
      });

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
  private async finishAuth(params: { sessionId: string; code: string }): Promise<any> {
    const { sessionId, code } = params;

    this.sendEvent({
      level: 'debug',
      message: `Completing OAuth for session ${sessionId}`,
      timestamp: Date.now(),
      metadata: { sessionId, userId: this.userId },
    });

    const session = await sessionStore.getSession(this.userId, sessionId);
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
        userId: this.userId,
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
        type: 'state_changed',
        sessionId,
        serverId: session.serverId || 'unknown',
        serverName: session.serverName || 'Unknown',
        state: 'CONNECTED',
        previousState: 'AUTHENTICATING',
        timestamp: Date.now(),
      });

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
  private async listPrompts(params: { sessionId: string }): Promise<any> {
    const { sessionId } = params;
    let client = this.clients.get(sessionId);

    if (!client) {
      client = new MCPClient({
        userId: this.userId,
        sessionId,
      });
      await client.connect();
      this.clients.set(sessionId, client);
    }

    const result = await client.listPrompts();
    return { prompts: result.prompts };
  }

  /**
   * Get a specific prompt
   */
  private async getPrompt(params: {
    sessionId: string;
    name: string;
    args?: Record<string, string>;
  }): Promise<any> {
    const { sessionId, name, args } = params;
    let client = this.clients.get(sessionId);

    if (!client) {
      client = new MCPClient({
        userId: this.userId,
        sessionId,
      });
      await client.connect();
      this.clients.set(sessionId, client);
    }

    const result = await client.getPrompt(name, args);
    return result;
  }

  /**
   * List resources from a session
   */
  private async listResources(params: { sessionId: string }): Promise<any> {
    const { sessionId } = params;
    let client = this.clients.get(sessionId);

    if (!client) {
      client = new MCPClient({
        userId: this.userId,
        sessionId,
      });
      await client.connect();
      this.clients.set(sessionId, client);
    }

    const result = await client.listResources();
    return { resources: result.resources };
  }

  /**
   * Read a specific resource
   */
  private async readResource(params: { sessionId: string; uri: string }): Promise<any> {
    const { sessionId, uri } = params;
    let client = this.clients.get(sessionId);

    if (!client) {
      client = new MCPClient({
        userId: this.userId,
        sessionId,
      });
      await client.connect();
      this.clients.set(sessionId, client);
    }

    const result = await client.readResource(uri);
    return result;
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
