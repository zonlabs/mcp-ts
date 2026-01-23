/**
 * SSE Client for MCP Connections
 * Browser-side client that connects to SSE endpoint
 */

import { nanoid } from 'nanoid';
import type { McpConnectionEvent, McpObservabilityEvent } from '../shared/events';
import type { McpRpcRequest, McpRpcResponse } from '../shared/types';

export interface SSEClientOptions {
  /**
   * SSE endpoint URL
   */
  url: string;

  /**
   * User ID for authentication
   */
  userId: string;

  /**
   * Optional auth token
   */
  authToken?: string;

  /**
   * Connection event callback
   */
  onConnectionEvent?: (event: McpConnectionEvent) => void;

  /**
   * Observability event callback
   */
  onObservabilityEvent?: (event: McpObservabilityEvent) => void;

  /**
   * Connection status callback
   */
  onStatusChange?: (status: 'connecting' | 'connected' | 'disconnected' | 'error') => void;
}

/**
 * SSE Client for real-time MCP connection management
 */
export class SSEClient {
  private eventSource: EventSource | null = null;
  private pendingRequests: Map<
    string,
    { resolve: (value: any) => void; reject: (error: Error) => void }
  > = new Map();
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private reconnectDelay: number = 1000;
  private isManuallyDisconnected: boolean = false;
  private connectionPromise: Promise<void> | null = null;
  private connectionResolver: (() => void) | null = null;

  constructor(private options: SSEClientOptions) {}

  /**
   * Connect to SSE endpoint
   */
  connect(): void {
    if (this.eventSource) {
      return; // Already connected
    }

    this.isManuallyDisconnected = false;
    this.options.onStatusChange?.('connecting');

    // Create connection promise
    this.connectionPromise = new Promise((resolve) => {
      this.connectionResolver = resolve;
    });

    // Build URL with query params
    // Handle both relative and absolute URLs
    const url = new URL(this.options.url, typeof window !== 'undefined' ? window.location.origin : undefined);
    url.searchParams.set('userId', this.options.userId);
    if (this.options.authToken) {
      url.searchParams.set('token', this.options.authToken);
    }

    // Create EventSource
    this.eventSource = new EventSource(url.toString());

    // Handle connection open
    this.eventSource.addEventListener('open', () => {
      console.log('[SSEClient] Connected');
      this.reconnectAttempts = 0;
      this.options.onStatusChange?.('connected');
    });

    // Handle 'connected' event - server confirms manager is ready
    this.eventSource.addEventListener('connected', (e: MessageEvent) => {
      const data = JSON.parse(e.data);
      console.log('[SSEClient] Server ready:', data);

      // Resolve connection promise - now safe to send requests
      if (this.connectionResolver) {
        this.connectionResolver();
        this.connectionResolver = null;
      }
    });

    // Handle 'connection' events (MCP connection state changes)
    this.eventSource.addEventListener('connection', (e: MessageEvent) => {
      const event: McpConnectionEvent = JSON.parse(e.data);
      this.options.onConnectionEvent?.(event);
    });

    // Handle 'observability' events (debugging/logging)
    this.eventSource.addEventListener('observability', (e: MessageEvent) => {
      const event: McpObservabilityEvent = JSON.parse(e.data);
      this.options.onObservabilityEvent?.(event);
    });

    // Handle 'rpc-response' events (RPC method responses)
    this.eventSource.addEventListener('rpc-response', (e: MessageEvent) => {
      const response: McpRpcResponse = JSON.parse(e.data);
      this.handleRpcResponse(response);
    });

    // Handle errors
    this.eventSource.addEventListener('error', () => {
      console.error('[SSEClient] Connection error');
      this.options.onStatusChange?.('error');

      // Attempt reconnection
      if (!this.isManuallyDisconnected && this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        console.log(`[SSEClient] Reconnecting (attempt ${this.reconnectAttempts})...`);

        setTimeout(() => {
          this.disconnect();
          this.connect();
        }, this.reconnectDelay * this.reconnectAttempts);
      }
    });
  }

  /**
   * Disconnect from SSE endpoint
   */
  disconnect(): void {
    this.isManuallyDisconnected = true;

    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    // Reset connection promise
    this.connectionPromise = null;
    this.connectionResolver = null;

    // Reject all pending requests
    for (const [id, { reject }] of this.pendingRequests.entries()) {
      reject(new Error('Connection closed'));
    }
    this.pendingRequests.clear();

    this.options.onStatusChange?.('disconnected');
  }

  /**
   * Send RPC request via SSE
   * Note: SSE is unidirectional (server->client), so we need to send requests via POST
   */
  private async sendRequest(method: string, params?: any): Promise<any> {
    // Wait for connection to be fully established
    if (this.connectionPromise) {
      await this.connectionPromise;
    }

    // Generate unique request ID using nanoid (e.g., "rpc_V1StGXR8_Z5jdHi")
    const id = `rpc_${nanoid(10)}`;

    const request: McpRpcRequest = {
      id,
      method: method as any,
      params,
    };

    // Create promise for response
    const promise = new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('Request timeout'));
        }
      }, 30000);
    });

    // Send request via POST to same endpoint
    try {
      // Handle both relative and absolute URLs
      const url = new URL(this.options.url, typeof window !== 'undefined' ? window.location.origin : undefined);
      url.searchParams.set('userId', this.options.userId);

      await fetch(url.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.options.authToken && { Authorization: `Bearer ${this.options.authToken}` }),
        },
        body: JSON.stringify(request),
      });
    } catch (error) {
      this.pendingRequests.delete(id);
      throw error;
    }

    return promise;
  }

  /**
   * Handle RPC response
   */
  private handleRpcResponse(response: McpRpcResponse): void {
    const pending = this.pendingRequests.get(response.id);

    if (pending) {
      this.pendingRequests.delete(response.id);

      if (response.error) {
        pending.reject(new Error(response.error.message));
      } else {
        pending.resolve(response.result);
      }
    }
  }

  /**
   * Get all user sessions
   */
  async getSessions(): Promise<any> {
    return this.sendRequest('getSessions');
  }

  /**
   * Connect to an MCP server
   */
  async connectToServer(params: {
    serverId: string;
    serverName: string;
    serverUrl: string;
    callbackUrl: string;
    transportType?: 'sse' | 'streamable_http';
  }): Promise<any> {
    return this.sendRequest('connect', params);
  }

  /**
   * Disconnect from an MCP server
   */
  async disconnectFromServer(sessionId: string): Promise<any> {
    return this.sendRequest('disconnect', { sessionId });
  }

  /**
   * List tools from a session
   */
  async listTools(sessionId: string): Promise<any> {
    return this.sendRequest('listTools', { sessionId });
  }

  /**
   * Call a tool
   */
  async callTool(
    sessionId: string,
    toolName: string,
    toolArgs: Record<string, unknown>
  ): Promise<any> {
    return this.sendRequest('callTool', { sessionId, toolName, toolArgs });
  }

  /**
   * Refresh/validate a session
   */
  async restoreSession(sessionId: string): Promise<any> {
    return this.sendRequest('restoreSession', { sessionId });
  }

  /**
   * Complete OAuth authorization
   */
  async finishAuth(sessionId: string, code: string): Promise<any> {
    return this.sendRequest('finishAuth', { sessionId, code });
  }

  /**
   * List available prompts
   */
  async listPrompts(sessionId: string): Promise<any> {
    return this.sendRequest('listPrompts', { sessionId });
  }

  /**
   * Get a specific prompt with arguments
   */
  async getPrompt(sessionId: string, name: string, args?: Record<string, string>): Promise<any> {
    return this.sendRequest('getPrompt', { sessionId, name, args });
  }

  /**
   * List available resources
   */
  async listResources(sessionId: string): Promise<any> {
    return this.sendRequest('listResources', { sessionId });
  }

  /**
   * Read a specific resource
   */
  async readResource(sessionId: string, uri: string): Promise<any> {
    return this.sendRequest('readResource', { sessionId, uri });
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.eventSource !== null && this.eventSource.readyState === EventSource.OPEN;
  }
}
