/**
 * SSE Client for MCP Connections
 *
 * Browser-side client that manages real-time communication with the MCP server
 * using Server-Sent Events (SSE) for server→client streaming and HTTP POST for
 * client→server RPC requests.
 *
 * Key features:
 * - Direct HTTP response for RPC calls (bypasses SSE latency)
 * - Resource preloading for instant MCP App UI loading
 * - Automatic reconnection with exponential backoff
 * - Type-safe RPC methods
 */

import { nanoid } from 'nanoid';
import type {
  McpConnectionEvent,
  McpObservabilityEvent,
  McpAppsUIEvent
} from '../../shared/events.js';
import type {
  McpRpcRequest,
  McpRpcResponse,
  McpRpcMethod,
  McpRpcParams,
  ConnectParams,
  SessionListResult,
  ConnectResult,
  DisconnectResult,
  RestoreSessionResult,
  FinishAuthResult,
  ListToolsRpcResult,
  ListPromptsResult,
  ListResourcesResult,
} from '../../shared/types.js';
import type { AppHostClient } from './types.js';

// ============================================
// Types & Interfaces
// ============================================

export interface SSEClientOptions {
  /** SSE endpoint URL */
  url: string;

  /** User/Client identifier */
  identity: string;

  /** Optional auth token for authenticated requests */
  authToken?: string;

  /** Callback for MCP connection state changes */
  onConnectionEvent?: (event: McpConnectionEvent) => void;

  /** Callback for observability/logging events */
  onObservabilityEvent?: (event: McpObservabilityEvent) => void;

  /** Callback for connection status changes */
  onStatusChange?: (status: ConnectionStatus) => void;

  /** Callback for MCP App UI events */
  onEvent?: (event: McpAppsUIEvent) => void;

  /** Request timeout in milliseconds @default 60000 */
  requestTimeout?: number;

  /** Enable debug logging @default false */
  debug?: boolean;
}

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
}

interface ToolUiMetadata {
  resourceUri?: string;
  uri?: string;
  visibility?: string[];
}

// ============================================
// Constants
// ============================================

const DEFAULT_REQUEST_TIMEOUT = 60000;
const MAX_RECONNECT_ATTEMPTS = 5;
const BASE_RECONNECT_DELAY = 1000;

// ============================================
// SSEClient Class
// ============================================

/**
 * SSE Client for real-time MCP connection management
 */
export class SSEClient implements AppHostClient {
  private eventSource: EventSource | null = null;
  private pendingRequests = new Map<string, PendingRequest>();
  private resourceCache = new Map<string, Promise<unknown>>();

  private reconnectAttempts = 0;
  private isManuallyDisconnected = false;
  private connectionPromise: Promise<void> | null = null;
  private connectionResolver: (() => void) | null = null;

  constructor(private readonly options: SSEClientOptions) {}

  // ============================================
  // Connection Management
  // ============================================

  /**
   * Connect to the SSE endpoint
   */
  connect(): void {
    if (this.eventSource) {
      return; // Already connected
    }

    this.isManuallyDisconnected = false;
    this.options.onStatusChange?.('connecting');
    this.connectionPromise = new Promise((resolve) => {
      this.connectionResolver = resolve;
    });

    const url = this.buildUrl();
    this.eventSource = new EventSource(url);
    this.setupEventListeners();
  }

  /**
   * Disconnect from the SSE endpoint
   */
  disconnect(): void {
    this.isManuallyDisconnected = true;

    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    this.connectionPromise = null;
    this.connectionResolver = null;
    this.rejectAllPendingRequests(new Error('Connection closed'));
    this.options.onStatusChange?.('disconnected');
  }

  /**
   * Check if connected to the SSE endpoint
   */
  isConnected(): boolean {
    return this.eventSource?.readyState === EventSource.OPEN;
  }

  // ============================================
  // RPC Methods
  // ============================================

  async getSessions(): Promise<SessionListResult> {
    return this.sendRequest<SessionListResult>('getSessions');
  }

  async connectToServer(params: ConnectParams): Promise<ConnectResult> {
    return this.sendRequest<ConnectResult>('connect', params);
  }

  async disconnectFromServer(sessionId: string): Promise<DisconnectResult> {
    return this.sendRequest<DisconnectResult>('disconnect', { sessionId });
  }

  async listTools(sessionId: string): Promise<ListToolsRpcResult> {
    return this.sendRequest<ListToolsRpcResult>('listTools', { sessionId });
  }

  async callTool(
    sessionId: string,
    toolName: string,
    toolArgs: Record<string, unknown>
  ): Promise<unknown> {
    const result = await this.sendRequest('callTool', { sessionId, toolName, toolArgs });
    this.emitUiEventIfPresent(result, sessionId, toolName);
    return result;
  }

  async restoreSession(sessionId: string): Promise<RestoreSessionResult> {
    return this.sendRequest<RestoreSessionResult>('restoreSession', { sessionId });
  }

  async finishAuth(sessionId: string, code: string): Promise<FinishAuthResult> {
    return this.sendRequest<FinishAuthResult>('finishAuth', { sessionId, code });
  }

  async listPrompts(sessionId: string): Promise<ListPromptsResult> {
    return this.sendRequest<ListPromptsResult>('listPrompts', { sessionId });
  }

  async getPrompt(sessionId: string, name: string, args?: Record<string, string>): Promise<unknown> {
    return this.sendRequest('getPrompt', { sessionId, name, args });
  }

  async listResources(sessionId: string): Promise<ListResourcesResult> {
    return this.sendRequest<ListResourcesResult>('listResources', { sessionId });
  }

  async readResource(sessionId: string, uri: string): Promise<unknown> {
    return this.sendRequest('readResource', { sessionId, uri });
  }

  // ============================================
  // Resource Preloading (for instant UI loading)
  // ============================================

  /**
   * Preload UI resources for tools that have UI metadata.
   * Call this when tools are discovered to enable instant MCP App UI loading.
   */
  preloadToolUiResources(sessionId: string, tools: Array<{ name: string; _meta?: unknown }>): void {
    for (const tool of tools) {
      const uri = this.extractUiResourceUri(tool);
      if (!uri) continue;

      if (this.resourceCache.has(uri)) {
        this.log(`Resource already cached: ${uri}`);
        continue;
      }

      this.log(`Preloading UI resource for tool "${tool.name}": ${uri}`);
      const promise = this.sendRequest('readResource', { sessionId, uri })
        .catch((err) => {
          this.log(`Failed to preload resource ${uri}: ${err.message}`, 'warn');
          this.resourceCache.delete(uri);
          return null;
        });

      this.resourceCache.set(uri, promise);
    }
  }

  /**
   * Get a preloaded resource from cache, or fetch if not cached.
   */
  getOrFetchResource(sessionId: string, uri: string): Promise<unknown> {
    const cached = this.resourceCache.get(uri);
    if (cached) {
      this.log(`Cache hit for resource: ${uri}`);
      return cached;
    }

    this.log(`Cache miss, fetching resource: ${uri}`);
    const promise = this.sendRequest('readResource', { sessionId, uri });
    this.resourceCache.set(uri, promise);
    return promise;
  }

  /**
   * Check if a resource is already cached
   */
  hasPreloadedResource(uri: string): boolean {
    return this.resourceCache.has(uri);
  }

  /**
   * Clear the resource cache
   */
  clearResourceCache(): void {
    this.resourceCache.clear();
  }

  // ============================================
  // Private: Request Handling
  // ============================================

  /**
   * Send an RPC request and return the response directly from HTTP.
   * This bypasses SSE latency by returning results in the HTTP response body.
   */
  private async sendRequest<T = unknown>(method: McpRpcMethod, params?: McpRpcParams): Promise<T> {
    if (this.connectionPromise) {
      await this.connectionPromise;
    }

    const request: McpRpcRequest = {
      id: `rpc_${nanoid(10)}`,
      method,
      params,
    };

    const response = await fetch(this.buildUrl(), {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json() as McpRpcResponse;
    return this.parseRpcResponse<T>(data, request.id);
  }

  /**
   * Parse RPC response and handle different response formats
   */
  private parseRpcResponse<T>(data: McpRpcResponse, requestId: string): T | Promise<T> {
    // Fast path: Direct response (new behavior)
    if ('result' in data) {
      return data.result as T;
    }

    // Error response
    if ('error' in data && data.error) {
      throw new Error(data.error.message || 'Unknown RPC error');
    }

    // Legacy path: Acknowledgment only (wait for SSE)
    // Kept for backwards compatibility with older servers
    if ('acknowledged' in data) {
      return this.waitForSseResponse<T>(requestId);
    }

    throw new Error('Invalid RPC response format');
  }

  /**
   * Wait for RPC response via SSE (legacy fallback)
   */
  private waitForSseResponse<T>(requestId: string): Promise<T> {
    const timeoutMs = this.options.requestTimeout ?? DEFAULT_REQUEST_TIMEOUT;

    return new Promise<T>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`Request timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pendingRequests.set(requestId, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timeoutId,
      });
    });
  }

  /**
   * Handle RPC response received via SSE (legacy)
   */
  private handleRpcResponse(response: McpRpcResponse): void {
    const pending = this.pendingRequests.get(response.id);
    if (!pending) return;

    clearTimeout(pending.timeoutId);
    this.pendingRequests.delete(response.id);

    if (response.error) {
      pending.reject(new Error(response.error.message));
    } else {
      pending.resolve(response.result);
    }
  }

  // ============================================
  // Private: Event Handling
  // ============================================

  private setupEventListeners(): void {
    if (!this.eventSource) return;

    this.eventSource.addEventListener('open', () => {
      this.log('Connected');
      this.reconnectAttempts = 0;
      this.options.onStatusChange?.('connected');
    });

    this.eventSource.addEventListener('connected', () => {
      this.log('Server ready');
      this.connectionResolver?.();
      this.connectionResolver = null;
    });

    this.eventSource.addEventListener('connection', (e: MessageEvent) => {
      const event = JSON.parse(e.data) as McpConnectionEvent;
      this.options.onConnectionEvent?.(event);
    });

    this.eventSource.addEventListener('observability', (e: MessageEvent) => {
      const event = JSON.parse(e.data) as McpObservabilityEvent;
      this.options.onObservabilityEvent?.(event);
    });

    this.eventSource.addEventListener('rpc-response', (e: MessageEvent) => {
      const response = JSON.parse(e.data) as McpRpcResponse;
      this.handleRpcResponse(response);
    });

    this.eventSource.addEventListener('error', () => {
      this.log('Connection error', 'error');
      this.options.onStatusChange?.('error');
      this.attemptReconnect();
    });
  }

  private attemptReconnect(): void {
    if (this.isManuallyDisconnected || this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      return;
    }

    this.reconnectAttempts++;
    const delay = BASE_RECONNECT_DELAY * this.reconnectAttempts;
    this.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);

    setTimeout(() => {
      this.disconnect();
      this.connect();
    }, delay);
  }

  // ============================================
  // Private: Utilities
  // ============================================

  private buildUrl(): string {
    const url = new URL(this.options.url, globalThis.location?.origin);
    url.searchParams.set('identity', this.options.identity);
    if (this.options.authToken) {
      url.searchParams.set('token', this.options.authToken);
    }
    return url.toString();
  }

  private buildHeaders(): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };
    if (this.options.authToken) {
      headers['Authorization'] = `Bearer ${this.options.authToken}`;
    }
    return headers;
  }

  private rejectAllPendingRequests(error: Error): void {
    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timeoutId);
      pending.reject(error);
    }
    this.pendingRequests.clear();
  }

  private extractUiResourceUri(tool: { name: string; _meta?: unknown }): string | undefined {
    const meta = (tool._meta as { ui?: ToolUiMetadata })?.ui;
    if (!meta || typeof meta !== 'object') return undefined;

    // Check visibility constraint
    if (meta.visibility && !meta.visibility.includes('app')) return undefined;

    // Support both 'resourceUri' and 'uri' field names
    return meta.resourceUri ?? meta.uri;
  }

  private emitUiEventIfPresent(result: unknown, sessionId: string, toolName: string): void {
    const meta = (result as { _meta?: { ui?: ToolUiMetadata } })?._meta;
    const resourceUri = meta?.ui?.resourceUri ?? (meta as any)?.['ui/resourceUri'];

    if (resourceUri) {
      this.options.onEvent?.({
        type: 'mcp-apps-ui',
        sessionId,
        resourceUri,
        toolName,
        result,
        timestamp: Date.now(),
      });
    }
  }

  private log(message: string, level: 'info' | 'warn' | 'error' = 'info'): void {
    if (!this.options.debug && level === 'info') return;

    const prefix = '[SSEClient]';
    switch (level) {
      case 'warn':
        console.warn(prefix, message);
        break;
      case 'error':
        console.error(prefix, message);
        break;
      default:
        console.log(prefix, message);
    }
  }
}
