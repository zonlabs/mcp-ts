/**
 * Type definitions for MCP operations
 */
import { Tool, CallToolResult, Prompt, Resource, ResourceTemplateType as ResourceTemplate, GetPromptResult, ReadResourceResult } from "@modelcontextprotocol/client";
import type { DiscoverResult, ProtocolEra, Implementation } from "@modelcontextprotocol/client";

// ---------------------------------------------------------------------------
// Core Capability Interfaces
// ---------------------------------------------------------------------------

/**
 * A client that can list and execute MCP tools.
 *
 * This is the structural interface that `ToolRouter`, adapters, and other
 * consumers use to interact with any MCP client implementation.
 * Both `McpClient` and `RemoteToolClient` satisfy this interface.
 */
export interface BaseClient {
  isConnected(): boolean;
  listTools(options?: { filtered?: boolean }): Promise<{ tools: Tool[] }>;
  callTool(name: string, args: Record<string, unknown>): Promise<any>;
  readonly session?: SessionInfo;
}

/** Alias for `BaseClient` */
export type ToolClient = BaseClient;

/**
 * A provider that manages multiple `BaseClient` instances.
 *
 * `McpManager` satisfies this interface. Pass it directly
 * to `ToolRouter` or adapters to aggregate tools from all connected servers.
 */
export interface BaseClientProvider {
  getClients(): BaseClient[];
}

/** Alias for `BaseClientProvider` */
export type ToolClientProvider = BaseClientProvider;

// Connect API types
export interface ConnectRequest {
  serverUrl: string;
  callbackUrl: string;
}

export interface ConnectSuccessResponse {
  success: true;
  sessionId: string;
}

export interface ConnectAuthRequiredResponse {
  requiresAuth: true;
  authUrl: string;
  sessionId: string;
}

export interface ConnectErrorResponse {
  error: string;
}

export type ConnectResponse =
  | ConnectSuccessResponse
  | ConnectAuthRequiredResponse
  | ConnectErrorResponse;

// Callback API types
export interface CallbackSuccessResponse {
  success: true;
  message: string;
}

export interface CallbackErrorResponse {
  error: string;
}

export type CallbackResponse = CallbackSuccessResponse | CallbackErrorResponse;

// Disconnect API types
export interface DisconnectRequest {
  sessionId: string;
}

export interface DisconnectSuccessResponse {
  success: true;
  message: string;
}

export interface DisconnectErrorResponse {
  error: string;
}

export type DisconnectResponse =
  | DisconnectSuccessResponse
  | DisconnectErrorResponse;

// List Tools API types
export interface ListToolsSuccessResponse {
  tools: Tool[];
}

export interface ListToolsErrorResponse {
  error: string;
}

export type ListToolsResponse =
  | ListToolsSuccessResponse
  | ListToolsErrorResponse;

// Call Tool API types
export interface CallToolRequest {
  sessionId: string;
  toolName: string;
  toolArgs: Record<string, unknown>;
}

export interface CallToolSuccessResponse {
  content: Array<{
    type: string;
    text?: string;
    [key: string]: unknown;
  }>;
  isError: boolean;
}

export interface CallToolErrorResponse {
  error: string;
}

export type CallToolResponse =
  | CallToolSuccessResponse
  | CallToolErrorResponse;

// Helper type guards
export function isConnectSuccess(
  response: ConnectResponse
): response is ConnectSuccessResponse {
  return 'success' in response && response.success === true;
}

export function isConnectAuthRequired(
  response: ConnectResponse
): response is ConnectAuthRequiredResponse {
  return 'requiresAuth' in response && response.requiresAuth === true;
}

export function isConnectError(
  response: ConnectResponse
): response is ConnectErrorResponse {
  return 'error' in response;
}

export function isListToolsSuccess(
  response: ListToolsResponse
): response is ListToolsSuccessResponse {
  return 'tools' in response;
}

export function isCallToolSuccess(
  response: CallToolResponse
): response is CallToolSuccessResponse {
  return 'content' in response;
}

// Generic tool info type
export type ToolInfo = {
  name: string;
  description?: string;
  inputSchema?: Tool['inputSchema'];
  outputSchema?: Tool['outputSchema'];
};

// Transport type
export type TransportType = 'sse' | 'streamable-http';
export type SessionStatus = 'pending' | 'active';
export type ToolPolicyMode = 'all' | 'allowlist' | 'denylist';

export interface ToolPolicy {
  mode: ToolPolicyMode;
  toolIds: string[];
  updatedAt?: number;
}

// SSE/RPC types
export type McpRpcMethod =
  | 'connect'
  | 'disconnect'
  | 'reconnect'
  | 'listTools'
  | 'callTool'
  | 'listSessions'
  | 'getSession'
  | 'finishAuth'
  | 'listPrompts'
  | 'getPrompt'
  | 'listResources'
  | 'readResource'
  | 'listResourceTemplates'
  | 'setToolPolicy'
  | 'getToolPolicy'
  | 'updateSession';

export interface McpRpcRequest {
  id: string;
  method: McpRpcMethod;
  params?: McpRpcParams;
}

export interface McpRpcResponse<T = unknown> {
  id: string;
  result?: T;
  error?: {
    code: string;
    message: string;
  };
}

// RPC Parameter Types
export interface ConnectParams {
  serverId?: string; // Optional - generated server-side if not provided
  serverName: string;
  serverUrl: string;
  callbackUrl: string;
  transport?: { type?: TransportType };
  headers?: Record<string, string>;
  clientId?: string;
  clientSecret?: string;
  clientMetadataUrl?: string;
  /**
   * Arbitrary caller-supplied key-value pairs stored alongside the session.
   * The library stores this opaquely and never reads or interprets it.
   * Use it to attach your own reference IDs (e.g. a catalog server ID, tenant ID, etc.).
   */
  metadata?: Record<string, string>;
}

export interface DisconnectParams {
  sessionId: string;
}

export type ReconnectParams = ConnectParams;

export interface SessionParams {
  sessionId: string;
}

export interface CallToolParams {
  sessionId: string;
  toolName: string;
  toolArgs: Record<string, unknown>;
}

export interface GetPromptParams {
  sessionId: string;
  name: string;
  args?: Record<string, string>;
}

export interface ReadResourceParams {
  sessionId: string;
  uri: string;
}

export interface FinishAuthParams {
  state: string;
  code: string;
  iss?: string;
}

export interface SetToolPolicyParams {
  sessionId: string;
  toolPolicy: {
    mode: ToolPolicyMode;
    toolIds?: string[];
  };
}

export interface GetToolPolicyParams {
  sessionId: string;
}

export interface UpdateSessionParams {
  sessionId: string;
  enabled?: boolean;
}

export type McpRpcParams =
  | ConnectParams
  | DisconnectParams
  | ReconnectParams
  | SessionParams
  | CallToolParams
  | GetPromptParams
  | ReadResourceParams
  | FinishAuthParams
  | SetToolPolicyParams
  | GetToolPolicyParams
  | UpdateSessionParams
  | undefined;

// RPC Result Types
export interface SessionInfo {
  sessionId: string;
  serverId?: string;
  serverName?: string;
  serverUrl?: string;
  transport?: TransportType;
  serverOptions?: {
    client?: unknown;
    transport?: { type?: TransportType; protocolVersion?: string };
    discoverResult?: DiscoverResult;
  } | null;
  createdAt?: number;
  updatedAt?: number;
  /**
   * Session readiness for auto-restore.
   * `pending` means auth is in progress and should be resumed explicitly by user action.
   */
  status?: SessionStatus;
  toolPolicy?: ToolPolicy;
  enabled?: boolean;
  protocolEra?: ProtocolEra | null;
  protocolVersion?: string | null;
  discoverResult?: DiscoverResult | null;
  /** Caller-supplied metadata, stored and returned opaquely. */
  metadata?: Record<string, string>;
  /** Server implementation metadata returned during MCP initialize (name, version, icons, etc.) */
  serverInfo?: Implementation;
}

export interface SessionListResult {
  sessions: SessionInfo[];
}

export interface ConnectResult {
  sessionId: string;
  success: boolean;
}

export interface DisconnectResult {
  success: boolean;
}

export interface GetSessionResult {
  success: boolean;
  toolCount: number;
  protocolEra?: ProtocolEra | null;
  protocolVersion?: string | null;
  discoverResult?: DiscoverResult | null;
}

export interface FinishAuthResult {
  success: boolean;
  toolCount: number;
  protocolEra?: ProtocolEra | null;
  protocolVersion?: string | null;
  discoverResult?: DiscoverResult | null;
}

export interface ListToolsRpcResult {
  tools: Tool[];
}

export interface SetToolPolicyResult {
  success: boolean;
  toolPolicy: ToolPolicy;
  tools: Tool[];
  toolCount: number;
}

export interface UpdateSessionResult {
  success: boolean;
}

export type ToolAccessInfo = Tool & {
  toolId: string;
  allowed: boolean;
};

export interface GetToolPolicyResult {
  toolPolicy: ToolPolicy;
  tools: ToolAccessInfo[];
  toolCount: number;
  allowedToolCount: number;
}

export interface ListPromptsResult {
  prompts: Array<{
    name: string;
    description?: string;
    arguments?: Array<{
      name: string;
      description?: string;
      required?: boolean;
    }>;
  }>;
}

export interface ListResourcesResult {
  resources: Array<{
    uri: string;
    name: string;
    description?: string;
    mimeType?: string;
  }>;
}

export interface ListResourceTemplatesResult {
  resourceTemplates: Array<{
    uriTemplate: string;
    name: string;
    description?: string;
    mimeType?: string;
  }>;
}

export type { CallToolResult };

/**
 * Model Context Protocol (MCP) Server Types
 * Aligned with modern cloud API conventions.
 */

/**
 * Connection status of an MCP server.
 * Uses a discriminated union based on `state` (Smithery convention).
 */
export type McpServerConnectionStatus =
  | {
      state: 'connected';
    }
  | {
      state: 'disconnected';
    }
  | {
      state: 'auth_required';
      authorizationUrl?: string;
    }
  | {
      state: 'error';
      message: string;
    };

/**
/**
 * Authentication configuration payload for creating or updating an MCP server.
 * Callers provide credentials and client parameters in requests.
 */
export type McpServerAuthRequest =
  | {
      type: 'none';
    }
  | {
      type: 'bearer';
      /** Bearer authorization token. */
      token: string;
    }
  | {
      type: 'custom-headers';
      /** Custom HTTP headers and secret values to send with MCP requests. */
      headers: Record<string, string>;
    }
  | {
      type: 'oauth';
      /** OAuth 2.1 client configuration. */
      config?: {
        /** OAuth client identifier. */
        clientId?: string;
        /** OAuth client secret for confidential clients. Never returned in read responses. */
        clientSecret?: string;
        /** Client ID Metadata Document (CIMD) URL if using URL-based client IDs. */
        clientMetadataUrl?: string;
        /** Requested OAuth scopes. */
        scopes?: string[];
      };
    };

/**
 * Public authentication state returned on an MCP server resource.
 * Sensitive tokens and header values are strictly redacted from responses.
 */
export type McpServerAuth =
  | {
      type: 'none';
    }
  | {
      type: 'bearer';
    }
  | {
      type: 'custom-headers';
      /** Header keys configured on this server with redacted values. */
      headers: Record<string, string>;
    }
  | {
      type: 'oauth';
      /** Stable, persisted OAuth configuration. */
      config?: {
        /** Client ID Metadata Document (CIMD) URL if configured. */
        clientMetadataUrl?: string;
        /** Configured or granted OAuth scopes. */
        scopes?: string[];
      };
    };

/** Standardized MCP server entity representation. */
export interface McpServer {
  /** Unique identifier for the MCP server. */
  id: string;
  /** Fixed value identifying this object as an MCP server. */
  object: 'mcp_server';
  /** Display name of the MCP server. */
  name: string;
  /** URL endpoint of the MCP server. */
  url: string;
  /** Optional description of the MCP server. */
  description?: string;
  /** Whether the MCP server is enabled. */
  enabled: boolean;
  /** Live connection status of the server. */
  status: McpServerConnectionStatus;
  /** Authentication configuration for the MCP server. */
  auth: McpServerAuth;
  /** Active tool policy restricting or allowing tool access. */
  toolPolicy?: ToolPolicy;
  /** Arbitrary caller-supplied key-value metadata attached to this server. */
  metadata?: Record<string, unknown>;
  /** ISO timestamp when the server was created. */
  createdAt: string;
  /** ISO timestamp when the server was last updated. */
  updatedAt?: string;
}

export interface McpServersFindParameters {
  /** User or tenant identifier. */
  userId: string;
  /** Filter servers by enabled status. */
  enabled?: boolean;
  /** Case-insensitive text search matching name, url, or description. */
  search?: string;
}

export interface McpServersFindResponse {
  object: 'list';
  data: McpServer[];
}

export interface McpServersCreateParameters {
  /** User or tenant identifier. */
  userId: string;
  /** Display name for the MCP server. */
  name: string;
  /** URL endpoint of the MCP server. */
  url: string;
  /** Optional description of the MCP server. */
  description?: string;
  /** Whether the server should be enabled. Defaults to true. */
  enabled?: boolean;
  /** Authentication configuration request. */
  auth?: McpServerAuthRequest;
  /** Custom metadata key-values. */
  metadata?: Record<string, unknown>;
  /** Optional custom identifier override. Defaults to auto-generated ID. */
  serverId?: string;
  /** Optional OAuth callback URL. */
  callbackUrl?: string;
  /** Optional tool access policy. */
  toolPolicy?: ToolPolicy;
}

export interface McpServersGetByIdParameters {
  /** User or tenant identifier. */
  userId: string;
  /** The unique identifier of the MCP server to retrieve. */
  serverId: string;
}

export interface McpServersUpdateParameters {
  /** User or tenant identifier. */
  userId: string;
  /** The unique identifier of the MCP server to update. */
  serverId: string;
  /** Updated display name. */
  name?: string;
  /** Updated server URL endpoint. */
  url?: string;
  /** Updated description. */
  description?: string;
  /** Updated enabled state. */
  enabled?: boolean;
  /** Updated authentication configuration request. */
  auth?: McpServerAuthRequest;
  /** Updated or merged metadata. */
  metadata?: Record<string, unknown>;
  /** Updated tool access policy. */
  toolPolicy?: ToolPolicy;
}

export interface McpServersDeleteParameters {
  /** User or tenant identifier. */
  userId: string;
  /** The unique identifier of the MCP server to delete. */
  serverId: string;
}

export interface McpServersDeleteResponse {
  object: 'mcp_server';
  id: string;
  deleted: boolean;
}

export interface McpServersCreateOAuthUrlParameters {
  /** User or tenant identifier. */
  userId: string;
  /** The unique identifier of the MCP server. */
  serverId: string;
  /** Callback URL to redirect to after OAuth authorization. */
  callbackUrl?: string;
  /** Optional Client ID Metadata Document (CIMD) URL override for OAuth authorization. */
  clientMetadataUrl?: string;
}

export interface McpServerOAuthAuthorization {
  /** Fixed value identifying this object as an MCP server OAuth authorization. */
  object: 'mcp_server_oauth_authorization';

  /** The MCP server being authorized. */
  serverId: string;

  /** The provider authorization URL to redirect the user to. */
  url: string;

  /** The OAuth state value. This expires after 10 minutes. */
  state: string;

  /** The ISO 8601 timestamp when the authorization URL expires. */
  expiresAt: string;
}

export type McpServersCreateOAuthUrlResponse = McpServerOAuthAuthorization;

export interface McpServersFinishAuthParameters {
  /** User or tenant identifier. */
  userId: string;
  /** Authorization code received from the OAuth callback. */
  code: string;
  /** State parameter received from the OAuth callback. */
  state: string;
  /** Optional RFC 9207 issuer parameter. */
  iss?: string;
  /** Optional explicit server identifier override. */
  serverId?: string;
}

export interface McpServersDiscoverOAuthParameters {
  /** URL endpoint of the MCP server. */
  url: string;
}

export interface McpServersDiscoverOAuthResponse {
  /** Whether the MCP server supports OAuth. */
  supported: boolean;
  /** Discovered authorization server endpoint. */
  authorizationUrl?: string;
  /** Discovered token exchange endpoint. */
  tokenUrl?: string;
  /** Discovered dynamic client registration endpoint. */
  registrationUrl?: string;
  /** Protected resource URL as per RFC 9728. */
  resourceUrl?: string;
  /** Discovered OAuth scopes. */
  scopes?: string[];
  /** Whether Client ID Metadata Document (CIMD) is supported by the authorization server. */
  clientIdMetadataDocumentSupported?: boolean;
  /** Error message if discovery failed or server does not implement OAuth. */
  error?: string;
}

export interface McpServersListToolsParameters {
  /** User or tenant identifier. */
  userId: string;
  /** Server identifier. */
  serverId: string;
}

export interface McpServersListToolsResponse {
  tools: Tool[];
}

export interface McpServersCallToolParameters {
  /** User or tenant identifier. */
  userId: string;
  /** Server identifier. */
  serverId: string;
  /** Name of the tool to execute. */
  toolName: string;
  /** Arguments to pass to the tool. */
  args?: Record<string, unknown>;
}

export interface McpServersListPromptsParameters {
  /** User or tenant identifier. */
  userId: string;
  /** Server identifier. */
  serverId: string;
}

export interface McpServersListPromptsResponse {
  prompts: Prompt[];
}

export interface McpServersGetPromptParameters {
  /** User or tenant identifier. */
  userId: string;
  /** Server identifier. */
  serverId: string;
  /** Name of the prompt to retrieve. */
  name: string;
  /** Arguments for the prompt. */
  args?: Record<string, string>;
}

export interface McpServersListResourcesParameters {
  /** User or tenant identifier. */
  userId: string;
  /** Server identifier. */
  serverId: string;
}

export interface McpServersListResourcesResponse {
  resources: Resource[];
}

export interface McpServersReadResourceParameters {
  /** User or tenant identifier. */
  userId: string;
  /** Server identifier. */
  serverId: string;
  /** URI of the resource to read. */
  uri: string;
}

export interface McpServersListResourceTemplatesParameters {
  /** User or tenant identifier. */
  userId: string;
  /** Server identifier. */
  serverId: string;
}

export interface McpServersListResourceTemplatesResponse {
  resourceTemplates: ResourceTemplate[];
}



