/**
 * MCP TS — Model Context Protocol Client & Multi-Server Manager
 *
 * High-performance MCP client with OAuth 2.1 (PKCE & DCR), durable multi-tenant session
 * management across Redis, Supabase, Neon, and SQLite, and dynamic context-window optimization.
 *
 * @packageDocumentation
 */

export {
  Mcp,
  mcp,
  McpUser,
  type McpOptions,
  type McpUserOptions,
  type AddMcpServerOptions,
  type AddMcpServerResult,
} from './server/mcp/mcp.js';

export {
  McpClient,
  type McpClientOptions,
  type MCPOAuthClientOptions,
} from './server/mcp/client.js';

export {
  McpManager,
  type McpManagerOptions,
} from './server/mcp/manager.js';

// Re-export everything from subpackages
export * from './server';
export * from './client';
export * from './shared';
