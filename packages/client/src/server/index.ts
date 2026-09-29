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
export {
  createToolId,
  normalizeToolPolicy,
  normalizeToolPolicyForUpdate,
  isToolAllowed,
  assertToolAllowed,
  filterToolsByPolicy,
  validateToolPolicyAgainstTools,
  type ToolPolicyInput,
} from './storage/tool-policy.js';
export {
  createToolPolicyGateway,
  ToolPolicyGateway,
} from './mcp/tool-policy-gateway.js';
export { StorageOAuthClientProvider } from './mcp/storage-oauth-provider.js';
import type { SessionStore } from './storage/types.js';
import { sessions } from './storage/index.js';
import {
  McpServersResource,
  type McpServersResourceOptions,
} from './resources/mcp-servers-resource.js';

export {
  McpServersResource,
  type McpServersResourceOptions,
};

export interface ClientOptions {
  /**
   * Storage backend for MCP server configurations and sessions.
   * Defaults to global `sessions` store.
   */
  storage?: SessionStore;
}

/**
 * Main client entry point for Model Context Protocol operations.
 */
export class Client {
  public readonly storage: SessionStore;
  public readonly mcpServers: McpServersResource;

  constructor(options: ClientOptions = {}) {
    this.storage = options.storage ?? sessions;
    this.mcpServers = new McpServersResource({
      storage: this.storage,
    });
  }
}

/**
 * Creates a new configured Client instance.
 */
export function createClient(options: ClientOptions = {}): Client {
  return new Client(options);
}

/**
 * Default global client instance.
 *
 * @example
 * ```ts
 * import { client } from "@mcp-ts/client";
 *
 * await client.mcpServers.create({ userId: 'user_123', name: 'Tavily', url: '...' });
 * const { data: servers } = await client.mcpServers.find({ userId: 'user_123' });
 * ```
 */
export const client = createClient();
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
