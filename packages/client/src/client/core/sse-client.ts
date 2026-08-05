/**
 * Stateless RPC-over-stream client for MCP connections.
 *
 * Uses single POST requests with `Accept: text/event-stream` for every RPC call.
 * Progress events and the final rpc-response are delivered in the same response.
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
  GetSessionResult,
  FinishAuthResult,
  ListToolsRpcResult,
  ListPromptsResult,
  ListResourcesResult,
  ListResourceTemplatesResult,
  SetToolPolicyResult,
  GetToolPolicyResult,
  UpdateSessionResult,
  ToolPolicy,
} from '../../shared/types.js';

export interface SSEClientOptions {
  /** MCP endpoint URL */
  url: string;

  /** User/Client identifier */
  userId: string;

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

  /** Enable debug logging @default false */
  debug?: boolean;
}

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

const CONNECTION_EVENT_INTERVAL_MS = 300;

interface ToolUiMetadata {
  resourceUri?: string;
  uri?: string;
  visibility?: string[];
}

export class SSEClient {
  private resourceCache = new Map<string, Promise<unknown>>();
  private connected = false;

  constructor(private readonly options: SSEClientOptions) {}

  connect(): void {
    if (this.connected) {
      return;
    }
    this.connected = true;
    this.options.onStatusChange?.('connected');
    this.log('RPC mode: post_stream');
  }

  disconnect(): void {
    this.connected = false;
    this.options.onStatusChange?.('disconnected');
  }

  isConnected(): boolean {
    return this.connected;
  }

  async listSessions(): Promise<SessionListResult> {
    return this.sendRequest<SessionListResult>('listSessions');
  }

  async connectToServer(params: ConnectParams): Promise<ConnectResult> {
    return this.sendRequest<ConnectResult>('connect', params);
  }

  async disconnectFromServer(sessionId: string): Promise<DisconnectResult> {
    return this.sendRequest<DisconnectResult>('disconnect', { sessionId });
  }

  async reconnectToServer(params: ConnectParams): Promise<ConnectResult> {
    return this.sendRequest<ConnectResult>('reconnect', params);
  }

  async setToolPolicy(
    sessionId: string,
    toolPolicy: Pick<ToolPolicy, 'mode'> & { toolIds?: string[] }
  ): Promise<SetToolPolicyResult> {
    return this.sendRequest<SetToolPolicyResult>('setToolPolicy', { sessionId, toolPolicy });
  }

  async getToolPolicy(sessionId: string): Promise<GetToolPolicyResult> {
    return this.sendRequest<GetToolPolicyResult>('getToolPolicy', { sessionId });
  }

  async updateSession(sessionId: string, enabled: boolean): Promise<UpdateSessionResult> {
    return this.sendRequest<UpdateSessionResult>('updateSession', { sessionId, enabled });
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

  async getSession(sessionId: string): Promise<GetSessionResult> {
    return this.sendRequest<GetSessionResult>('getSession', { sessionId });
  }

  async finishAuth(state: string, code: string, iss?: string): Promise<FinishAuthResult> {
    return this.sendRequest<FinishAuthResult>('finishAuth', { state, code, ...(iss && { iss }) });
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

  async listResourceTemplates(sessionId: string): Promise<ListResourceTemplatesResult> {
    return this.sendRequest<ListResourceTemplatesResult>('listResourceTemplates', { sessionId });
  }

  async readResource(sessionId: string, uri: string): Promise<unknown> {
    return this.sendRequest('readResource', { sessionId, uri });
  }

  preloadToolUiResources(sessionId: string, tools: Array<{ name: string; _meta?: unknown }>): void {
    for (const tool of tools) {
      const uri = this.extractUiResourceUri(tool);
      if (!uri || this.resourceCache.has(uri)) continue;
      const promise = this.sendRequest('readResource', { sessionId, uri }).catch((err) => {
        this.log(`Failed to preload resource ${uri}: ${err.message}`, 'warn');
        this.resourceCache.delete(uri);
        return null;
      });
      this.resourceCache.set(uri, promise);
    }
  }

  getOrFetchResource(sessionId: string, uri: string): Promise<unknown> {
    const cached = this.resourceCache.get(uri);
    if (cached) return cached;
    const promise = this.sendRequest('readResource', { sessionId, uri });
    this.resourceCache.set(uri, promise);
    return promise;
  }

  hasPreloadedResource(uri: string): boolean {
    return this.resourceCache.has(uri);
  }

  clearResourceCache(): void {
    this.resourceCache.clear();
  }

  private async sendRequest<T = unknown>(method: McpRpcMethod, params?: McpRpcParams): Promise<T> {
    if (!this.connected) {
      this.connect();
    }

    this.log(`RPC request via post_stream: ${method}`);

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

    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    if (!contentType.includes('text/event-stream')) {
      const data = await response.json() as McpRpcResponse;
      return this.parseRpcResponse<T>(data);
    }

    const data = await this.readRpcResponseFromStream(response, {
      delayConnectionEvents:
        method === 'connect' ||
        method === 'getSession' ||
        method === 'finishAuth',
    });
    return this.parseRpcResponse<T>(data);
  }

  private async readRpcResponseFromStream(
    response: Response,
    options: { delayConnectionEvents?: boolean } = {}
  ): Promise<McpRpcResponse> {
    if (!response.body) {
      throw new Error('Streaming response body is missing');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let rpcResponse: McpRpcResponse | null = null;

    const dispatchBlock = async (block: string) => {
      const lines = block.split('\n');
      let eventName = 'message';
      const dataLines: string[] = [];

      for (const rawLine of lines) {
        const line = rawLine.replace(/\r$/, '');
        if (!line || line.startsWith(':')) continue;
        if (line.startsWith('event:')) {
          eventName = line.slice('event:'.length).trim();
          continue;
        }
        if (line.startsWith('data:')) {
          dataLines.push(line.slice('data:'.length).trimStart());
        }
      }

      if (!dataLines.length) return;
      const payloadText = dataLines.join('\n');
      let payload: unknown = payloadText;
      try {
        payload = JSON.parse(payloadText);
      } catch {
        // Keep raw text
      }

      switch (eventName) {
        case 'connected':
          this.options.onStatusChange?.('connected');
          break;
        case 'connection':
          this.options.onConnectionEvent?.(payload as McpConnectionEvent);
          if (options.delayConnectionEvents) {
            await this.sleep(CONNECTION_EVENT_INTERVAL_MS);
          }
          break;
        case 'observability':
          this.options.onObservabilityEvent?.(payload as McpObservabilityEvent);
          break;
        case 'rpc-response':
          rpcResponse = payload as McpRpcResponse;
          break;
        default:
          break;
      }
    };

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let separatorMatch = buffer.match(/\r?\n\r?\n/);
      while (separatorMatch && separatorMatch.index !== undefined) {
        const separatorIndex = separatorMatch.index;
        const separatorLength = separatorMatch[0].length;
        const block = buffer.slice(0, separatorIndex);
        buffer = buffer.slice(separatorIndex + separatorLength);
        await dispatchBlock(block);
        separatorMatch = buffer.match(/\r?\n\r?\n/);
      }
    }

    if (buffer.trim()) {
      await dispatchBlock(buffer);
    }

    if (!rpcResponse) {
      throw new Error('Missing rpc-response event in streamed RPC result');
    }

    return rpcResponse;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private parseRpcResponse<T>(data: McpRpcResponse): T {
    if ('result' in data) {
      return data.result as T;
    }
    if ('error' in data && data.error) {
      throw new Error(data.error.message || 'Unknown RPC error');
    }
    // JSON omits `result` when it is `undefined` (response becomes `{ id: ... }`).
    // Treat that shape as a successful void result.
    if (data && typeof data === 'object' && 'id' in data) {
      return undefined as T;
    }
    throw new Error('Invalid RPC response format');
  }

  private buildUrl(): string {
    return new URL(this.options.url, globalThis.location?.origin).toString();
  }

  private buildHeaders(): HeadersInit {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
      'x-mcp-user-id': this.options.userId,
    };

    if (this.options.authToken) {
      headers['Authorization'] = `Bearer ${this.options.authToken}`;
    }
    
    return headers;
  }

  private extractUiResourceUri(tool: { name: string; _meta?: unknown }): string | undefined {
    const meta = (tool._meta as { ui?: ToolUiMetadata })?.ui;
    if (!meta || typeof meta !== 'object') return undefined;
    if (meta.visibility && !meta.visibility.includes('app')) return undefined;
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



