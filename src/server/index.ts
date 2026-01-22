/**
 * MCP Redis Server Package
 * Node.js server-side exports for MCP connection management with Redis
 */

// Core MCP client and session management
export { MCPClient, UnauthorizedError } from './oauth-client';
export { SessionStore, sessionStore } from './session-store';
export { RedisOAuthClientProvider } from './redis-oauth-client-provider';

// SSE handler for real-time connections
export { createSSEHandler, SSEConnectionManager, type SSEHandlerOptions } from './sse-handler';

// Next.js App Router handler (recommended for Next.js 13+)
export { createNextMcpHandler, type NextMcpHandlerOptions } from './nextjs-handler';

// Session provider abstraction

// Utilities
export { sanitizeServerLabel } from '../shared/utils';

// Re-export shared types
export type {
  McpConnectionEvent,
  McpConnectionState,
  McpObservabilityEvent,
  Emitter,
  Disposable,
  Event,
} from '../shared/events';

export type {
  ToolInfo,
  McpRpcRequest,
  McpRpcResponse,
  ConnectRequest,
  ConnectResponse,
  ListToolsResponse,
  CallToolRequest,
  CallToolResponse,
} from '../shared/types';

// Re-export MCP SDK types for convenience
export type {
  OAuthClientMetadata,
  OAuthClientInformation,
  OAuthClientInformationFull,
  OAuthTokens,
} from '@modelcontextprotocol/sdk/shared/auth.js';

export type {
  ListToolsResult,
  CallToolResult,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
