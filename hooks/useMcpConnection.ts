import { useState, useCallback, useMemo } from 'react';
import { toast } from "react-hot-toast";
import { McpServer, ToolInfo } from '@/types/mcp';
import {
  useMcpStore,
  type McpStore,
  type StoredConnection,
  findConnectionForServer
} from '@/lib/stores/mcp-store';
import { normalizeServerUrl } from '@/lib/url';

// Re-export StoredConnection & McpConnection
import type { McpConnection } from '@mcp-ts/client/react';
export type { StoredConnection, McpConnection };

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
  headers?: Record<string, string> | Array<{ key: string; value: string }> | null;
  clientId?: string | null;
  clientSecret?: string | null;
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

function extractTransport(server: ConnectableServer): "sse" | "streamable-http" {
  const raw = server.transportType || server.transport || null;
  const normalized = normalizeTransport(raw);
  const inferred = inferTransportFromUrl(extractServerUrl(server));

  if (inferred === "sse") return "sse";
  if (inferred === "streamable-http") return "streamable-http";
  return normalized ?? "streamable-http";
}

function inferTransportFromUrl(url?: string | null): "sse" | "streamable-http" | null {
  if (!url) return null;
  const urlLower = url.toLowerCase();
  if (urlLower.includes("/sse") || urlLower.includes("transport=sse")) {
    return "sse";
  }
  if (urlLower.includes("tools=") || urlLower.includes("/mcp")) {
    return "streamable-http";
  }
  return null;
}

function normalizeTransport(value?: string | null): "sse" | "streamable-http" | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "sse") return "sse";
  if (normalized === "streamable_http" || normalized === "streamable-http" || normalized === "streamablehttp") {
    return "streamable-http";
  }
  return null;
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
  const mergeWithStoredState = useCallback(<T extends { id: string, connectionStatus?: string | null | undefined, tools?: ToolInfo[], transport?: string | null }>(serverList: T[]): T[] => {
    return serverList.map((server) => {
      const stored = findConnectionForServer(connections, server);
      if (stored) {
        return {
          ...server,
          connectionStatus: stored.connectionStatus,
          transport: stored.transport ?? server.transport,
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
      toast.error(`Failed to connect ${server.title || server.name || "server"}`);
      return;
    }

    const transport = extractTransport(server);

    setIsConnecting(true);
    setConnectionError(null);

    const serverName = server.title || server.name;

    try {
      const mcpActions = useMcpStore.getState().mcpActions;
      if (!mcpActions) {
        throw new Error("Please sign in first.");
      }

      const callbackUrl = `${window.location.origin}/auth/callback/success`;
      const identity = String(server.id || serverUrl || server.name || "").trim();
      if (!identity) {
        throw new Error("Missing server identity for connection.");
      }

      await mcpActions.connect({
        serverId: identity,
        serverName: serverName,
        serverUrl: serverUrl,
        transportType: transport,
        callbackUrl,
        headers: normalizeHeaders(server.headers),
        clientId: server.clientId || undefined,
        clientSecret: server.clientSecret || undefined,
        metadata: server.id ? { catalogServerId: server.id } : undefined,
      });

    } catch (error) {
      const errorMsg = `Failed to connect ${server.title || server.name || "server"}`;
      setConnectionError(errorMsg);
      toast.error(errorMsg);
      throw (error instanceof Error ? error : new Error(errorMsg));
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const disconnect = useCallback(async (server: ConnectableServer) => {
    const store = useMcpStore.getState();
    const storedConnection =
      findConnectionForServer(store.connections, server) ||
      store.getConnectionByServerId(server.id) ||
      (extractServerUrl(server)
        ? store.getConnectionByServerId(extractServerUrl(server) as string)
        : undefined);

    if (!storedConnection?.sessionId) {
      // Try lookup by assuming server.id is sessionId (legacy behavior?)
      const directConn = getConnection(server.id);
      if (!directConn) {
        // Clear any pending state for this server from store if present
        const updatedConns = { ...store.connections };
        let changed = false;
        for (const [key, conn] of Object.entries(updatedConns)) {
          if (conn.serverId === server.id || (server.url && conn.url === server.url)) {
            delete updatedConns[key];
            changed = true;
          }
        }
        if (changed) {
          useMcpStore.setState({
            connections: updatedConns,
            activeConnectionCount: Object.values(updatedConns).filter((c) => c.connectionStatus === 'READY').length,
          });
        }
        return;
      }
      try {
        const mcpActions = useMcpStore.getState().mcpActions;
        if (!mcpActions) {
          throw new Error("Please sign in first.");
        }
        await mcpActions.disconnect(directConn.sessionId);
      } catch (error) {
        toast.error("Something went wrong");
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
      toast.error("Something went wrong");
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
