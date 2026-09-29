/**
 * MCP TS — Model Context Protocol Client & Multi-Server Manager
 *
 * @packageDocumentation
 */

export {
  client,
  createClient,
  Client,
  type ClientOptions,
  McpServersResource,
  type McpServersResourceOptions,
} from './server/index.js';

export {
  McpClient,
  type McpClientOptions,
  type McpListType,
  type McpListChangedEvent,
  type MCPOAuthClientOptions,
} from './server/mcp/client.js';

export {
  McpManager,
  type McpManagerOptions,
} from './server/mcp/manager.js';

// Re-export everything from subpackages
export * from './server/index.js';
export * from './client/index.js';
export * from './shared/index.js';
