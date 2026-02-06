/**
 * MCP Redis Client Package - React
 * React client-side exports for MCP connection management
 */

// React Hooks
export { useMcp, type UseMcpOptions, type McpClient, type McpConnection } from './use-mcp.js';
export { useAppHost } from './use-app-host.js';
export { useMcpAppIframe, type McpAppIframeProps } from './use-mcp-app-iframe.js';

// AG-UI Subscriber Pattern (Framework-agnostic)
export {
  useAguiSubscriber,
  useMcpApps,
  useToolCallEvents,
} from './use-agui-subscriber.js';

export {
  createMcpAppSubscriber,
  subscribeMcpAppEvents,
  McpAppEventManager,
  type McpAppEvent,
  type McpAppEventHandler,
  type ToolCallEventData,
  type ToolCallEventHandler,
  type McpAppSubscriberConfig,
} from './agui-subscriber.js';

// Re-export shared types and client from main entry
export * from '../index.js';
