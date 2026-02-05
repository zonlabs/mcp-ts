/**
 * MCP Redis Client Package - React
 * React client-side exports for MCP connection management
 */

// React Hook
export { useMcp, type UseMcpOptions, type McpClient, type McpConnection } from './useMcp';
export { useMcpApp } from './use-mcp-app';

// Re-export shared types and client from main entry
export * from '../index';
