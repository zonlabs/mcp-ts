/**
 * MCP TS Client Package
 * Browser/React client-side exports for MCP connection management
 */

/** SSE client for real-time connections */
export { SSEClient, type SSEClientOptions } from './core/sse-client';
export { AppHost, DEFAULT_MCP_APP_CSP } from './core/app-host';
export {
  APP_HOST_DEFAULTS,
  SANDBOX_PROXY_READY_METHOD,
  SANDBOX_RESOURCE_READY_METHOD,
} from './core/constants.js';



/** Re-export shared types */
export type {
  McpConnectionEvent,
  McpConnectionState,
  McpObservabilityEvent,
  Emitter,
  Disposable,
  Event,
  DisposableStore,
} from '../shared/events';

export type {
  ToolInfo,
  McpRpcRequest,
  McpRpcResponse,
} from '../shared/types';
