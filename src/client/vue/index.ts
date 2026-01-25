/**
 * MCP Redis Client Package - Vue.js
 * Vue.js client-side exports for MCP connection management
 */

// Vue Composable
export { useMcp, type UseMcpOptions, type McpClient, type McpConnection } from './useMcp';

// Re-export shared types and client from main entry
export * from '../index';
