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
  const { connections, isLoading, refresh } = useMcpConnection();

  const currentServers = Object.values(connections)
    .filter((c) => c.state === 'READY')
    .map((c) => ({
      serverName: c.serverName || 'MCP Server',
      sessionId: c.sessionId,
      connectionStatus: 'READY',
      tools: (c.tools as ToolInfo[]) || [],
      connectedAt: c.updatedAt?.toISOString() || c.createdAt?.toISOString() || new Date().toISOString(),
      transport: c.transport,
      url: c.serverUrl,
    }));

  const loadMcpServers = async () => {
    if (typeof window === 'undefined') return;
    await refresh();
  };

  return {
    mcpServers: currentServers,
    loading: isLoading && currentServers.length === 0,
    loadMcpServers,
  };
}
