/**
 * Type definitions for MCP operations
 */
import { Tool, CallToolResult } from "@modelcontextprotocol/client";
import type { DiscoverResult, ProtocolEra } from "@modelcontextprotocol/client";

// ---------------------------------------------------------------------------
// Core Capability Interfaces
// ---------------------------------------------------------------------------

/**
 * A client that can list and execute MCP tools.
 *
 * This is the structural interface that `ToolRouter`, adapters, and other
 * consumers use to interact with any MCP client implementation.
 * Both `MCPClient` and `createMcpClient()` satisfy this interface.
 */
export interface ToolClient {
  isConnected(): boolean;
  listTools(options?: { filtered?: boolean }): Promise<{ tools: Tool[] }>;
  callTool(name: string, args: Record<string, unknown>): Promise<any>;
  getServerId?(): string | undefined;
  getServerName?(): string | undefined;
  getServerUrl?(): string | undefined;
  getSessionId?(): string;
}

/**
 * A provider that manages multiple `ToolClient` instances.
 *
 * `MultiSessionClient` satisfies this interface. Pass it directly
 * to `ToolRouter` or adapters to aggregate tools from all connected servers.
 */
export interface ToolClientProvider {
  getClients(): ToolClient[];
}

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
  updatedAt: number;
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
  serverUrl: string;
  transport?: TransportType;
  serverOptions?: {
    client?: unknown;
    transport?: { type?: TransportType; protocolVersion?: string };
    discoverResult?: DiscoverResult;
  } | null;
  createdAt: number;
  updatedAt?: number;
  /**
   * Session readiness for auto-restore.
   * `pending` means auth is in progress and should be resumed explicitly by user action.
   */
  status: SessionStatus;
  toolPolicy?: ToolPolicy;
  enabled?: boolean;
  protocolEra?: ProtocolEra | null;
  protocolVersion?: string | null;
  discoverResult?: DiscoverResult | null;
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
