/**
 * MCP Redis Shared Package
 * Shared types and utilities for both server and client
 */

// Events
export {
  Emitter,
  DisposableStore,
  type Disposable,
  type Event,
  type McpConnectionState,
  type McpConnectionEvent,
  type McpObservabilityEvent,
} from './events';

// Constants
export * from './constants';

// Errors
export * from './errors';

// Types
export type {
  ToolInfo,
  McpRpcRequest,
  McpRpcResponse,
  McpRpcMethod,
  McpRpcParams,
  TransportType,
  // API types
  ConnectRequest,
  ConnectResponse,
  ConnectSuccessResponse,
  ConnectAuthRequiredResponse,
  ConnectErrorResponse,
  ListToolsResponse,
  CallToolRequest,
  CallToolResponse,
  // RPC param types
  ConnectParams,
  DisconnectParams,
  SessionParams,
  CallToolParams,
  GetPromptParams,
  ReadResourceParams,
  FinishAuthParams,
  // RPC result types
  SessionInfo,
  SessionListResult,
  ConnectResult,
  DisconnectResult,
  RestoreSessionResult,
  FinishAuthResult,
  ListToolsRpcResult,
  ListPromptsResult,
  ListResourcesResult,
} from './types';

export {
  isConnectSuccess,
  isConnectAuthRequired,
  isConnectError,
  isListToolsSuccess,
  isCallToolSuccess,
} from './types';

// Utilities
export { sanitizeServerLabel } from './utils.js';
export {
  getToolUiResourceUri,
  findToolByName,
  type ToolUiConfig,
} from './tool-utils.js';

