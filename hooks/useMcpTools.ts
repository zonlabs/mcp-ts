"use client";

import { useMcpConnection } from './useMcpConnection';
import { ToolInfo } from '@/types/mcp';

export interface McpServerWithTools {
  serverName: string;
  sessionId: string;
  connectionStatus: string;
  tools: ToolInfo[];
  connectedAt: string;
  transport?: string;
  url?: string;
}

export interface UseMcpToolsReturn {
  mcpServers: McpServerWithTools[];
  loading: boolean;
  loadMcpServers: () => void;
}

/**
 * Hook to get all active MCP servers and their tools from API
 * NOTE: OAuth headers are NOT fetched client-side for security
 * Headers are retrieved server-side in the CopilotKit route
 */
export function useMcpTools(): UseMcpToolsReturn {
  const { connections, isLoading, validateConnections } = useMcpConnection();

  const currentServers = Object.values(connections)
    .filter(connection => connection.connectionStatus === 'READY')
    .map(connection => ({
      serverName: connection.serverName,
      sessionId: connection.sessionId,
      connectionStatus: connection.connectionStatus,
      tools: connection.tools,
      connectedAt: connection.connectedAt,
      transport: connection.transport,
      url: connection.url,
    } as McpServerWithTools));

  const loadMcpServers = async () => {
    if (typeof window === 'undefined') return;
    await validateConnections();
  };

  return {
    mcpServers: currentServers,
    loading: isLoading && currentServers.length === 0,
    loadMcpServers,
  };
}
