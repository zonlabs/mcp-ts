/**
 * MCP Redis Client Package
 * Browser/React client-side exports for MCP connection management
 */

// SSE client for real-time connections
export { SSEClient, type SSEClientOptions } from './sse-client';

// React hook
export { useMcp, type UseMcpOptions, type McpClient, type McpConnection } from './useMcp';

// Re-export shared types
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
