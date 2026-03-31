import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { nanoid } from 'nanoid';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import {
  UnauthorizedError as SDKUnauthorizedError,
  refreshAuthorization,
  discoverOAuthProtectedResourceMetadata,
  discoverAuthorizationServerMetadata,
} from '@modelcontextprotocol/sdk/client/auth.js';
import {
  ClientCapabilities,
  ClientCapabilitiesCapabilities,
} from '@modelcontextprotocol/sdk/shared/capabilities.js';
import { ClientRequest, TextContent, ToolUseBlock } from '@modelcontextprotocol/sdk/shared/messages.js';
import { Tool, ToolInputSchema } from '@modelcontextprotocol/sdk/shared/types.js';
import {
  JSONRPCMessage,
  JSONRPCRequest,
} from '@modelcontextprotocol/sdk/shared/jsonrpc.js';

export interface McpAppClientCapabilities extends ClientCapabilities {
  extensions?: {
    'io.modelcontextprotocol/ui'?: {
      mimeTypes: string[];
    };
    [key: string]: object;
  };
}