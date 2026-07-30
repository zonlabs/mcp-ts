/**
 * MCP TS Server Package
 * Node.js server-side exports for MCP connection management
 */

/** Core MCP client and session management */
export { MCPClient } from './mcp/oauth-client.js';
export { UnauthorizedError } from '../shared/errors.js';
export { sessions, onSessionMutation, withDbObservability, type SessionStore } from './storage/index.js';
export { StorageOAuthClientProvider } from './mcp/storage-oauth-provider.js';
export { MultiSessionClient } from './mcp/multi-session-client.js';

/** SSE handler for real-time connections */
export { createSSEHandler, SSEConnectionManager, type SSEHandlerOptions, type ClientMetadata } from './handlers/sse-handler.js';

/** Next.js App Router handler (recommended for Next.js 13+) */
export { createNextMcpHandler, type NextMcpHandlerOptions } from './handlers/nextjs-handler.js';

/** Session provider abstraction */

/** Utilities */
export { sanitizeServerLabel } from '../shared/utils';
export { encryptObject, decryptObject } from './storage/crypto.js';

/** Re-export shared types */
export type {
  McpConnectionEvent,
  McpConnectionState,
  McpObservabilityEvent,
  Emitter,
  Disposable,
  Event,
} from '../shared/events';

export type {
  ToolClient,
  ToolClientProvider,
  ToolInfo,
  McpRpcRequest,
  McpRpcResponse,
  ConnectRequest,
  ConnectResponse,
  ListToolsResponse,
  CallToolRequest,
  CallToolResponse,
} from '../shared/types';

export type {
  Session,
  SessionMutationEvent,
  SessionMutationListener,
  SessionMutationType,
} from './storage/types.js';

/** Re-export MCP SDK types for convenience */
export type {
  OAuthClientMetadata,
  OAuthClientInformation,
  OAuthClientInformationFull,
  OAuthTokens,
} from '@modelcontextprotocol/client';

export type {
  ListToolsResult,
  CallToolResult,
  Tool,
} from '@modelcontextprotocol/client';
