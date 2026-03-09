import { useState, useCallback, useMemo } from 'react';
import { toast } from "react-hot-toast";
import { McpServer, ToolInfo } from '@/types/mcp';
import {
  useMcpStore,
  type McpStore,
  type StoredConnection,
  findConnectionForServer
} from '@/lib/stores/mcp-store';

// Re-export StoredConnection for backward compatibility
export type { StoredConnection };

interface UseMcpConnectionProps {
  servers?: McpServer[] | null;
  setServers?: (servers: McpServer[] | null | ((prev: McpServer[] | null) => McpServer[] | null)) => void;
  serverId?: string;
}

type ConnectableServer = {
  id: string;
  name: string;
  url?: string | null;
  remoteUrl?: string | null;
  transport?: string;
  transportType?: string | null;
  title?: string | null;
};

function normalizeServerUrl(url?: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url.trim());
    const path = parsed.pathname.replace(/\/+$/, '') || '/';
    return `${parsed.origin}${path}${parsed.search}`;
  } catch {
    return url.trim().replace(/\/+$/, '');
  }
}

function extractServerUrl(server: ConnectableServer): string | null {
  return server.remoteUrl || server.url || null;
}

function extractTransport(server: ConnectableServer): string | null {
  return server.transportType || server.transport || null;
}

function showMcpErrorToast(scope: 'connect' | 'disconnect', message: string) {
  toast.error(message);
}

export function useMcpConnection({ serverId }: UseMcpConnectionProps = {}) {
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  // Get shared connections from Zustand store
  const connections = useMcpStore((state: McpStore) => state.connections);
  const isLoading = useMcpStore((state: McpStore) => state.isValidating);
  const validateAllSessions = useMcpStore((state: McpStore) => state.validateAllSessions);

  // Get connection by sessionId
  const getConnection = useCallback((id: string) => {
    const bySession = connections[id];
    if (bySession) return bySession;

    const byServerId = Object.values(connections).find((c) => c.serverId === id);
    if (byServerId) return byServerId;

    const normalizedInput = normalizeServerUrl(id);
    if (!normalizedInput) return null;

    return (
      Object.values(connections).find(
        (c) => normalizeServerUrl(c.url) === normalizedInput
      ) || null
    );
  }, [connections]);

  // Get connection status
  const getConnectionStatus = useCallback((id: string): 'CONNECTED' | 'DISCONNECTED' => {
    return getConnection(id)?.connectionStatus === 'READY' ? 'CONNECTED' : 'DISCONNECTED';
  }, [getConnection]);

  // Check if connected
  const isServerConnected = useCallback((id: string): boolean => {
    return getConnection(id)?.connectionStatus === 'READY';
  }, [getConnection]);

  // Get tools
  const getServerTools = useCallback((id: string): ToolInfo[] => {
    return getConnection(id)?.tools || [];
  }, [getConnection]);

  // Active connections
  const activeConnections = useMemo(() => {
    return Object.entries(connections)
      .filter(([_, conn]) => conn.connectionStatus === 'READY')
      .reduce((acc, [id, conn]) => {
        acc[id] = conn;
        return acc;
      }, {} as Record<string, StoredConnection>);
  }, [connections]);

  const activeConnectionCount = useMemo(() => {
    return Object.keys(activeConnections).length;
  }, [activeConnections]);

  // Single server data
  const connection = serverId ? getConnection(serverId) : null;
  const isConnected = serverId ? isServerConnected(serverId) : false;
  const tools = serverId ? getServerTools(serverId) : [];

  // Merge with server list
  const mergeWithStoredState = useCallback(<T extends { id: string, connectionStatus?: string | null | undefined, tools?: ToolInfo[] }>(serverList: T[]): T[] => {
    return serverList.map((server) => {
      const stored = findConnectionForServer(connections, server);
      if (stored) {
        return {
          ...server,
          connectionStatus: stored.connectionStatus,
          tools: stored.tools || [],
        };
      }
      return {
        ...server,
        connectionStatus: server.connectionStatus || 'DISCONNECTED',
      };
    });
  }, [connections]);

  const connect = useCallback(async (server: ConnectableServer) => {
    const serverUrl = extractServerUrl(server);
    if (!serverUrl) {
      showMcpErrorToast('connect', "No URL available for this server");
      return;
    }

    const transport = extractTransport(server);

    setIsConnecting(true);
    setConnectionError(null);

    try {
      const mcpActions = useMcpStore.getState().mcpActions;
      if (!mcpActions) {
        throw new Error("Please sign in first.");
      }

      const callbackUrl = `${window.location.origin}/api/mcp/auth/callback`;
      const identity = String(server.id || serverUrl || server.name || "").trim();
      if (!identity) {
        throw new Error("Missing server identity for connection.");
      }

      await mcpActions.connect({
        serverId: identity,
        serverName: server.title || server.name,
        serverUrl: serverUrl,
        transportType: transport,
        callbackUrl
      });

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Failed to connect";
      setConnectionError(errorMsg);
      showMcpErrorToast('connect', errorMsg);
      throw (error instanceof Error ? error : new Error(errorMsg));
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const disconnect = useCallback(async (server: ConnectableServer) => {
    const storedConnection =
      useMcpStore.getState().getConnectionByServerId(server.id) ||
      (extractServerUrl(server)
        ? useMcpStore.getState().getConnectionByServerId(extractServerUrl(server) as string)
        : undefined);

    if (!storedConnection?.sessionId) {
      // Try lookup by assuming server.id is sessionId (legacy behavior?)
      const directConn = getConnection(server.id);
      if (!directConn) {
        showMcpErrorToast('disconnect', "Connection information not found");
        return;
      }
      try {
        const mcpActions = useMcpStore.getState().mcpActions;
        if (!mcpActions) {
          throw new Error("Please sign in first.");
        }
        await mcpActions.disconnect(directConn.sessionId);
      } catch (error) {
        showMcpErrorToast('disconnect', error instanceof Error ? error.message : "Failed to disconnect");
      }
      return;
    }

    try {
      const mcpActions = useMcpStore.getState().mcpActions;
      if (!mcpActions) {
        throw new Error("Please sign in first.");
      }

      await mcpActions.disconnect(storedConnection.sessionId);
    } catch (error) {
      showMcpErrorToast('disconnect', error instanceof Error ? error.message : "Failed to disconnect");
    }
  }, []);

  // Backward compatibility for validateConnections
  const validateConnections = useCallback(
    async (
      filterFn?: (serverId: string) => boolean,
      onProgress?: (validated: number, total: number) => void
    ) => {
      await validateAllSessions();
      if (onProgress) {
        const total = Object.keys(connections).length;
        onProgress(total, total);
      }
    },
    [validateAllSessions, connections]
  );

  return {
    // State
    isConnecting,
    connectionError,
    isLoading,

    // Single server data
    connection,
    isConnected,
    tools,

    // Helpers
    getConnection,
    getConnectionStatus,
    isServerConnected,
    getServerTools,

    // Active connections
    activeConnections,
    activeConnectionCount,

    // All connections
    connections,

    // Actions
    connect,
    disconnect,
    validateConnections,

    // Utilities
    mergeWithStoredState,
  };
}
