/**
 * MCP SDK - React Client
 * Simple React hooks for MCP app rendering
 */

// Core MCP Hook
export { useMcp, type UseMcpOptions, type McpClient, type McpConnection } from './use-mcp.js';

// Optional OAuth popup conveniences. These are not required for auth:
// consumers can still provide their own onRedirect handler, callback page UI,
// or complete `finishAuth(state, code)` from a normal redirect flow.
export {
  useMcpOAuthPopup,
  openCenteredPopup,
  createOAuthPopupRedirectHandler,
  McpOAuthCallbackContent,
  McpOAuthCallbackFallback,
  type OAuthPopupConnectionLike,
  type OAuthPopupRedirectOptions,
  type McpOAuthCallbackContentProps,
} from './oauth-popup.js';

// App Host (internal use)
export { useAppHost } from './use-app-host.js';

// Simplified MCP Apps Hook - the main API
export {
  useMcpApps,
  McpAppRenderer,
  getMcpAppMetadata,
  type McpAppRendererProps,
  type McpAppRendererHandle,
  type McpAppMetadata,
} from './use-mcp-apps.js';

// Re-export shared types and client from main entry
export * from '../index.js';
