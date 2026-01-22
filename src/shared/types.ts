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

// SSE/RPC types
export interface McpRpcRequest {
  id: string;
  method: 'connect' | 'disconnect' | 'listTools' | 'callTool' | 'getSessions' | 'refreshSession' | 'finishAuth';
  params?: any;
}

export interface McpRpcResponse {
  id: string;
  result?: any;
  error?: {
    code: string;
    message: string;
  };
}
