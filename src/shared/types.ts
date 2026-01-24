/**
 * Type definitions for MCP operations
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';

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
  inputSchema?: unknown;
};

// Transport type
export type TransportType = 'sse' | 'streamable_http';

// SSE/RPC types
export type McpRpcMethod =
  | 'connect'
  | 'disconnect'
  | 'listTools'
  | 'callTool'
  | 'getSessions'
  | 'restoreSession'
  | 'finishAuth'
  | 'listPrompts'
  | 'getPrompt'
  | 'listResources'
  | 'readResource';

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
  serverId: string;
  serverName: string;
  serverUrl: string;
  callbackUrl: string;
  transportType?: TransportType;
}

export interface DisconnectParams {
  sessionId: string;
}

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
  sessionId: string;
  code: string;
}

export type McpRpcParams =
  | ConnectParams
  | DisconnectParams
  | SessionParams
  | CallToolParams
  | GetPromptParams
  | ReadResourceParams
  | FinishAuthParams
  | undefined;

// RPC Result Types
export interface SessionInfo {
  sessionId: string;
  serverId?: string;
  serverName?: string;
  serverUrl: string;
  transport: TransportType;
  active: boolean;
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

export interface RestoreSessionResult {
  success: boolean;
  toolCount: number;
}

export interface FinishAuthResult {
  success: boolean;
  toolCount: number;
}

export interface ListToolsRpcResult {
  tools: Tool[];
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
