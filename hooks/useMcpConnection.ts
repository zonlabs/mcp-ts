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

const UNSUPPORTED_TRANSPORTS = ['stdio', 'websocket'];

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

export function useMcpConnection({ servers, setServers, serverId }: UseMcpConnectionProps = {}) {
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
    return connections[id]?.connectionStatus === 'READY' ? 'CONNECTED' : 'DISCONNECTED';
  }, [connections]);

  // Check if connected
  const isServerConnected = useCallback((id: string): boolean => {
    return connections[id]?.connectionStatus === 'READY';
  }, [connections]);

  // Get tools
  const getServerTools = useCallback((id: string): ToolInfo[] => {
    return connections[id]?.tools || [];
  }, [connections]);

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
      toast.error("No URL available for this server");
      return;
    }

    const transport = extractTransport(server);
    // Removed strict transport check to allow library to handle defaults
    // if (!transport) { ... }

    setIsConnecting(true);
    setConnectionError(null);

    try {
      const mcpActions = useMcpStore.getState().mcpActions;
      if (!mcpActions) throw new Error("MCP Actions not initialized");

      const callbackUrl = `${window.location.origin}/api/mcp/auth/callback`;

      await mcpActions.connect({
        serverId: server.id,
        serverName: server.title || server.name,
        serverUrl: serverUrl,
        transportType: transport,
        callbackUrl
      });

      // library handles toast and state update via store sync
      // await validateAllSessions(); // No longer needed
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Failed to connect";
      setConnectionError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const disconnect = useCallback(async (server: ConnectableServer) => {
    const connection = getConnection(server.id);
    // connection lookup might need to be robust if server.id vs sessionId
    // But getConnection(server.id) in this file looks up by serverId actually? 
    // No, getConnection takes 'id' which is used as key in connections.
    // In mcp-store, connections are keyed by sessionId.
    // So getConnection(server.id) probably returns undefined if server.id is not sessionId.

    // We should use getConnectionByServerId(server.id)
    const storedConnection =
      useMcpStore.getState().getConnectionByServerId(server.id) ||
      (extractServerUrl(server)
        ? useMcpStore.getState().getConnectionByServerId(extractServerUrl(server) as string)
        : undefined);

    if (!storedConnection?.sessionId) {
      // Try lookup by assuming server.id is sessionId (legacy behavior?)
      const directConn = getConnection(server.id);
      if (!directConn) {
        toast.error("Connection information not found");
        return;
      }
      try {
        const mcpActions = useMcpStore.getState().mcpActions;
        if (!mcpActions) throw new Error("MCP Actions not initialized");
        await mcpActions.disconnect(directConn.sessionId);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to disconnect");
      }
      return;
    }

    try {
      const mcpActions = useMcpStore.getState().mcpActions;
      if (!mcpActions) throw new Error("MCP Actions not initialized");

      await mcpActions.disconnect(storedConnection.sessionId);
      // await validateAllSessions();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to disconnect");
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
