/**
 * MCP TS Server Package
 * Node.js server-side exports for MCP connection management
 */

/** Core MCP client and session management */
export {
  McpClient,
  normalizeMcpSdkClientOptions,
  type McpSdkClientOptions,
  type McpClientOptions,
  type McpListType,
  type McpListChangedEvent,
  type MCPOAuthClientOptions,
} from './mcp/client.js';
export { UnauthorizedError } from '../shared/errors.js';
export {
  sessions,
  onSessionMutation,
  withDbObservability,
  FileStorageBackend,
  SqliteStorage,
  MemoryStorageBackend,
  RedisStorageBackend,
  SupabaseStorageBackend,
  NeonStorageBackend,
  type SessionStore,
} from './storage/index.js';
export { StorageOAuthClientProvider } from './mcp/storage-oauth-provider.js';
export {
  Mcp,
  mcp,
  McpUser,
  type McpOptions,
  type McpUserOptions,
  type AddMcpServerOptions,
  type AddMcpServerResult,
} from './mcp/mcp.js';
export {
  McpManager,
  type McpManagerOptions,
} from './mcp/manager.js';

/** SSE handler for real-time connections */
export { createSSEHandler, SSEConnectionManager, type SSEHandlerOptions, type ClientMetadata } from './handlers/sse-handler.js';

/** Next.js App Router handler (recommended for Next.js 13+) */
export { createNextMcpHandler, type NextMcpHandlerOptions, type AuthenticatedUser } from './handlers/nextjs-handler.js';

/** Session provider abstraction */

/** Utilities */
export { sanitizeServerLabel } from '../shared/utils.js';
export { encryptObject, decryptObject } from './storage/crypto.js';

/** Re-export shared types */
export type {
  McpConnectionEvent,
  McpConnectionState,
  McpObservabilityEvent,
  Emitter,
  Disposable,
  Event,
} from '../shared/events.js';

export type {
  BaseClient,
  BaseClientProvider,
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
} from '../shared/types.js';

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
  OAuthClientInformationMixed,
  OAuthClientProvider,
  OAuthClientInformationContext,
  OAuthDiscoveryState,
  StoredOAuthClientInformation,
  StoredOAuthTokens,
  OAuthTokens,
  DiscoverResult,
  ProtocolEra,
} from '@modelcontextprotocol/client';

export type {
  ListToolsResult,
  CallToolResult,
  Tool,
} from '@modelcontextprotocol/client';
