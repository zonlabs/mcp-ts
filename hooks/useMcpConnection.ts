'use client';

import { useState, useCallback, useMemo } from 'react';
import { toast } from 'react-hot-toast';
import type { McpServer, ToolInfo } from '@/types/mcp';
import { useMcpContext } from '@/components/providers/McpProvider';
import { findConnectionForServer } from '@/lib/mcp/connection-utils';
import type { McpConnection } from '@mcp-ts/client/react';

export type { McpConnection };

interface UseMcpConnectionProps {
  serverId?: string;
}

export type ConnectableServer = {
  id?: string;
  name?: string;
  title?: string | null;
  url?: string | null;
  remoteUrl?: string | null;
  transport?: string | null;
  transportType?: string | null;
  headers?: Record<string, string> | Array<{ key: string; value: string }> | null;
  clientId?: string | null;
  clientSecret?: string | null;
  [key: string]: any;
};

function normalizeHeaders(
  headers?: Record<string, string> | Array<{ key: string; value: string }> | null
): Record<string, string> | undefined {
  if (!headers) return undefined;

  const entries = Array.isArray(headers)
    ? headers.map((header) => [header.key, header.value] as const)
    : Object.entries(headers);

  const normalized = entries
    .map(([key, value]) => [String(key).trim(), String(value).trim()] as const)
    .filter(([key, value]) => key.length > 0 && value.length > 0);

  return normalized.length > 0 ? Object.fromEntries(normalized) : undefined;
}

function extractServerUrl(server: ConnectableServer): string | null {
  return server.remoteUrl || server.url || null;
}

function extractTransport(server: ConnectableServer): 'sse' | 'streamable-http' {
  const raw = (server.transportType || server.transport || '').toLowerCase().trim();
  if (raw === 'sse') return 'sse';
  const url = (extractServerUrl(server) || '').toLowerCase();
  if (url.includes('/sse') || url.includes('transport=sse')) return 'sse';
  return 'streamable-http';
}

export function useMcpConnection({ serverId }: UseMcpConnectionProps = {}) {
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const mcp = useMcpContext();

  const getConnection = useCallback(
    (serverOrId: string | ConnectableServer): McpConnection | undefined => {
      if (typeof serverOrId === 'string') {
        return (
          mcp.connectionMap[serverOrId] ||
          mcp.connections.find(
            (c) =>
              c.metadata?.catalogServerId === serverOrId ||
              c.serverId === serverOrId ||
              c.sessionId === serverOrId
          ) ||
          findConnectionForServer(mcp.connections, { id: serverOrId })
        );
      }
      return findConnectionForServer(mcp.connections, serverOrId);
    },
    [mcp.connections, mcp.connectionMap]
  );

  const isServerConnected = useCallback(
    (serverOrId: string | ConnectableServer): boolean => {
      return getConnection(serverOrId)?.state === 'READY';
    },
    [getConnection]
  );

  const connection = useMemo(
    () => (serverId ? getConnection(serverId) : undefined),
    [serverId, getConnection]
  );

  const tools = useMemo(
    () => (connection?.tools as ToolInfo[]) || [],
    [connection]
  );

  const connect = useCallback(
    async (server: ConnectableServer) => {
      const serverUrl = extractServerUrl(server);
      if (!serverUrl) {
        toast.error(`Failed to connect ${server.title || server.name || 'server'}: Missing URL`);
        return;
      }

      const transport = extractTransport(server);
      setIsConnecting(true);
      setConnectionError(null);

      const serverName = server.title || server.name || 'MCP Server';
      const identity = String(server.id || serverUrl || serverName).trim();
      const callbackUrl = typeof window !== 'undefined' ? `${window.location.origin}/auth/callback/success` : '';

      try {
        await mcp.connect({
          serverId: identity,
          serverName,
          serverUrl,
          transport: { type: transport },
          callbackUrl,
          headers: normalizeHeaders(server.headers),
          clientId: server.clientId || undefined,
          clientSecret: server.clientSecret || undefined,
          metadata: server.id ? { catalogServerId: server.id } : undefined,
        });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : `Failed to connect ${serverName}`;
        setConnectionError(errorMsg);
        toast.error(errorMsg);
        throw error;
      } finally {
        setIsConnecting(false);
      }
    },
    [mcp]
  );

  const disconnect = useCallback(
    async (serverOrId: string | ConnectableServer) => {
      const targetConn = getConnection(serverOrId);
      const sessionId = targetConn?.sessionId || (typeof serverOrId === 'string' ? serverOrId : undefined);

      if (!sessionId) return;

      try {
        await mcp.disconnect(sessionId);
      } catch {
        toast.error('Failed to disconnect');
      }
    },
    [getConnection, mcp]
  );

  return {
    isConnecting,
    connectionError,
    isLoading: mcp.isInitializing,
    connection,
    isConnected: connection?.state === 'READY',
    tools,
    getConnection,
    isServerConnected,
    activeConnections: mcp.activeConnections,
    activeConnectionCount: mcp.activeConnectionCount,
    connections: mcp.connectionMap,
    connectionList: mcp.connections,
    connect,
    disconnect,
    reconnect: mcp.reconnect,
    callTool: mcp.callTool,
    getToolAccess: mcp.getToolAccess,
    updateToolPolicy: mcp.updateToolPolicy,
    updateSession: mcp.updateSession,
    refresh: mcp.refresh,
  };
}
