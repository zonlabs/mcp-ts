/**
 * useMcp React Hook
 * Manages MCP connections with SSE-based real-time updates
 * Based on Cloudflare's agents pattern
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { SSEClient, type SSEClientOptions } from './sse-client';
import type { McpConnectionEvent, McpConnectionState } from '../shared/events';
import type {
  ToolInfo,
  FinishAuthResult,
  ListToolsRpcResult,
  ListPromptsResult,
  ListResourcesResult,
  SessionInfo,
} from '../shared/types';

export interface UseMcpOptions {
  /**
   * SSE endpoint URL
   */
  url: string;

  /**
   * User/Client identifier
   */
  identity: string;

  /**
   * Optional auth token
   */
  authToken?: string;

  /**
   * Auto-connect on mount
   * @default true
   */
  autoConnect?: boolean;

  /**
   * Auto-initialize sessions on mount
   * @default true
   */
  autoInitialize?: boolean;

  /**
   * Connection event callback
   */
  onConnectionEvent?: (event: McpConnectionEvent) => void;

  /**
   * Debug logging callback
   */
  onLog?: (level: string, message: string, metadata?: Record<string, unknown>) => void;
  /**
   * Optional callback to handle OAuth redirects (e.g. for popup flow)
   * If provided, this will be called instead of window.location.href assignment
   */
  onRedirect?: (url: string) => void;
}

export interface McpConnection {
  sessionId: string;
  serverId: string;
  serverName: string;
  serverUrl?: string;
  transport?: string;
  state: McpConnectionState;
  tools: ToolInfo[];
  error?: string;
  connectedAt?: Date;
}

export interface McpClient {
  /**
   * All connections
   */
  connections: McpConnection[];

  /**
   * SSE connection status
   */
  status: 'connecting' | 'connected' | 'disconnected' | 'error';

  /**
   * Whether initializing
   */
  isInitializing: boolean;

  /**
   * Connect to an MCP server
   */
  connect: (params: {
    serverId: string;
    serverName: string;
    serverUrl: string;
    callbackUrl: string;
    transportType?: 'sse' | 'streamable_http';
  }) => Promise<string>;

  /**
   * Disconnect from an MCP server
   */
  disconnect: (sessionId: string) => Promise<void>;

  /**
   * Get connection by session ID
   */
  getConnection: (sessionId: string) => McpConnection | undefined;

  /**
   * Get connection by server ID
   */
  getConnectionByServerId: (serverId: string) => McpConnection | undefined;

  /**
   * Check if server is connected
   */
  isServerConnected: (serverId: string) => boolean;

  /**
   * Get tools for a session
   */
  getTools: (sessionId: string) => ToolInfo[];

  /**
   * Refresh all connections
   */
  refresh: () => Promise<void>;

  /**
   * Manually connect SSE
   */
  connectSSE: () => void;

  /**
   * Manually disconnect SSE
   */
  disconnectSSE: () => void;

  /**
   * Complete OAuth authorization
   */
  finishAuth: (sessionId: string, code: string) => Promise<FinishAuthResult>;

  /**
   * Call a tool from a session
   */
  callTool: (
    sessionId: string,
    toolName: string,
    toolArgs: Record<string, unknown>
  ) => Promise<unknown>;

  /**
   * List available tools for a session
   */
  listTools: (sessionId: string) => Promise<ListToolsRpcResult>;

  /**
   * List available prompts for a session
   */
  listPrompts: (sessionId: string) => Promise<ListPromptsResult>;

  /**
   * Get a specific prompt with arguments
   */
  getPrompt: (sessionId: string, name: string, args?: Record<string, string>) => Promise<unknown>;

  /**
   * List available resources for a session
   */
  listResources: (sessionId: string) => Promise<ListResourcesResult>;

  /**
   * Read a specific resource
   */
  readResource: (sessionId: string, uri: string) => Promise<unknown>;
}

/**
 * React hook for MCP connection management with SSE
 */
export function useMcp(options: UseMcpOptions): McpClient {
  const {
    url,
    identity,
    authToken,
    autoConnect = true,
    autoInitialize = true,
    onConnectionEvent,
    onLog,
    onRedirect,
  } = options;

  const clientRef = useRef<SSEClient | null>(null);
  const isMountedRef = useRef(true);

  const [connections, setConnections] = useState<McpConnection[]>([]);
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>(
    'disconnected'
  );
  const [isInitializing, setIsInitializing] = useState(false);

  /**
   * Initialize SSE client
   */
  useEffect(() => {
    isMountedRef.current = true;

    const clientOptions: SSEClientOptions = {
      url,
      identity,
      authToken,
      onConnectionEvent: (event) => {
        // Update local state based on event
        updateConnectionsFromEvent(event);

        // Call user callback
        onConnectionEvent?.(event);
      },
      onObservabilityEvent: (event) => {
        onLog?.(event.level || 'info', event.message || event.displayMessage || 'No message', event.metadata);
      },
      onStatusChange: (newStatus) => {
        if (isMountedRef.current) {
          setStatus(newStatus);
        }
      },
    };

    const client = new SSEClient(clientOptions);
    clientRef.current = client;

    if (autoConnect) {
      client.connect();

      if (autoInitialize) {
        loadSessions();
      }
    }

    return () => {
      isMountedRef.current = false;
      client.disconnect();
    };
  }, [url, identity, authToken, autoConnect, autoInitialize]);

  /**
   * Update connections based on event
   */
  const updateConnectionsFromEvent = useCallback((event: McpConnectionEvent) => {
    if (!isMountedRef.current) return;

    setConnections((prev: McpConnection[]) => {
      switch (event.type) {
        case 'state_changed': {
          const existing = prev.find((c: McpConnection) => c.sessionId === event.sessionId);
          if (existing) {
            return prev.map((c: McpConnection) =>
              c.sessionId === event.sessionId ? { ...c, state: event.state } : c
            );
          } else {
            return [
              ...prev,
              {
                sessionId: event.sessionId,
                serverId: event.serverId,
                serverName: event.serverName,
                state: event.state,
                tools: [],
              },
            ];
          }
        }

        case 'tools_discovered': {
          return prev.map((c: McpConnection) =>
            c.sessionId === event.sessionId ? { ...c, tools: event.tools, state: 'READY' } : c
          );
        }

        case 'auth_required': {
          // Handle OAuth redirect
          if (event.authUrl) {
            onLog?.('info', `OAuth required - redirecting to ${event.authUrl}`, { authUrl: event.authUrl });

            if (onRedirect) {
              onRedirect(event.authUrl);
            } else if (typeof window !== 'undefined') {
              window.location.href = event.authUrl;
            }
          }
          return prev.map((c: McpConnection) =>
            c.sessionId === event.sessionId ? { ...c, state: 'AUTHENTICATING' } : c
          );
        }

        case 'error': {
          return prev.map((c: McpConnection) =>
            c.sessionId === event.sessionId ? { ...c, state: 'FAILED', error: event.error } : c
          );
        }

        case 'disconnected': {
          return prev.filter((c: McpConnection) => c.sessionId !== event.sessionId);
        }

        default:
          return prev;
      }
    });
  }, [onLog]);

  /**
   * Load sessions from server
   */
  const loadSessions = useCallback(async () => {
    if (!clientRef.current) return;

    try {
      setIsInitializing(true);

      const result = await clientRef.current.getSessions();
      const sessions = result.sessions || [];

      // Initialize connections
      if (isMountedRef.current) {
        setConnections(
          sessions.map((s: SessionInfo) => ({
            sessionId: s.sessionId,
            serverId: s.serverId ?? 'unknown',
            serverName: s.serverName ?? 'Unknown Server',
            serverUrl: s.serverUrl,
            transport: s.transport,
            state: 'VALIDATING' as McpConnectionState,
            tools: [],
          }))
        );
      }

      // Validate each session
      for (const session of sessions) {
        if (clientRef.current) {
          try {
            await clientRef.current.restoreSession(session.sessionId);
          } catch (error) {
            console.error(`[useMcp] Failed to validate session ${session.sessionId}:`, error);
          }
        }
      }
    } catch (error) {
      console.error('[useMcp] Failed to load sessions:', error);
      onLog?.('error', 'Failed to load sessions', { error });
    } finally {
      if (isMountedRef.current) {
        setIsInitializing(false);
      }
    }
  }, [onLog]);

  /**
   * Connect to an MCP server
   */
  const connect = useCallback(
    async (params: {
      serverId: string;
      serverName: string;
      serverUrl: string;
      callbackUrl: string;
      transportType?: 'sse' | 'streamable_http';
    }): Promise<string> => {
      if (!clientRef.current) {
        throw new Error('SSE client not initialized');
      }

      const result = await clientRef.current.connectToServer(params);
      return result.sessionId;
    },
    []
  );

  /**
   * Disconnect from an MCP server
   */
  const disconnect = useCallback(async (sessionId: string): Promise<void> => {
    if (!clientRef.current) {
      throw new Error('SSE client not initialized');
    }

    await clientRef.current.disconnectFromServer(sessionId);

    // Remove from local state
    if (isMountedRef.current) {
      setConnections((prev: McpConnection[]) => prev.filter((c: McpConnection) => c.sessionId !== sessionId));
    }
  }, []);

  /**
   * Refresh all connections
   */
  const refresh = useCallback(async () => {
    await loadSessions();
  }, [loadSessions]);

  /**
   * Manually connect SSE
   */
  const connectSSE = useCallback(() => {
    clientRef.current?.connect();
  }, []);

  /**
   * Manually disconnect SSE
   */
  const disconnectSSE = useCallback(() => {
    clientRef.current?.disconnect();
  }, []);

  /**
   * Complete OAuth authorization
   */
  const finishAuth = useCallback(async (sessionId: string, code: string): Promise<FinishAuthResult> => {
    if (!clientRef.current) {
      throw new Error('SSE client not initialized');
    }

    return await clientRef.current.finishAuth(sessionId, code);
  }, []);

  /**
   * Call a tool
   */
  const callTool = useCallback(
    async (
      sessionId: string,
      toolName: string,
      toolArgs: Record<string, unknown>
    ): Promise<unknown> => {
      if (!clientRef.current) {
        throw new Error('SSE client not initialized');
      }

      return await clientRef.current.callTool(sessionId, toolName, toolArgs);
    },
    []
  );

  /**
   * List tools (refresh tool list)
   */
  const listTools = useCallback(async (sessionId: string): Promise<ListToolsRpcResult> => {
    if (!clientRef.current) {
      throw new Error('SSE client not initialized');
    }

    return await clientRef.current.listTools(sessionId);
  }, []);

  /**
   * List prompts
   */
  const listPrompts = useCallback(async (sessionId: string): Promise<ListPromptsResult> => {
    if (!clientRef.current) {
      throw new Error('SSE client not initialized');
    }

    return await clientRef.current.listPrompts(sessionId);
  }, []);

  /**
   * Get a specific prompt
   */
  const getPrompt = useCallback(
    async (sessionId: string, name: string, args?: Record<string, string>): Promise<unknown> => {
      if (!clientRef.current) {
        throw new Error('SSE client not initialized');
      }

      return await clientRef.current.getPrompt(sessionId, name, args);
    },
    []
  );

  /**
   * List resources
   */
  const listResources = useCallback(async (sessionId: string): Promise<ListResourcesResult> => {
    if (!clientRef.current) {
      throw new Error('SSE client not initialized');
    }

    return await clientRef.current.listResources(sessionId);
  }, []);

  /**
   * Read a specific resource
   */
  const readResource = useCallback(async (sessionId: string, uri: string): Promise<unknown> => {
    if (!clientRef.current) {
      throw new Error('SSE client not initialized');
    }

    return await clientRef.current.readResource(sessionId, uri);
  }, []);

  // Utility functions
  const getConnection = useCallback(
    (sessionId: string) => connections.find((c: McpConnection) => c.sessionId === sessionId),
    [connections]
  );

  const getConnectionByServerId = useCallback(
    (serverId: string) => connections.find((c: McpConnection) => c.serverId === serverId),
    [connections]
  );

  const isServerConnected = useCallback(
    (serverId: string) => {
      const conn = getConnectionByServerId(serverId);
      return conn?.state === 'CONNECTED';
    },
    [getConnectionByServerId]
  );

  const getTools = useCallback(
    (sessionId: string) => {
      const conn = getConnection(sessionId);
      return conn?.tools || [];
    },
    [getConnection]
  );

  return {
    connections,
    status,
    isInitializing,
    connect,
    disconnect,
    getConnection,
    getConnectionByServerId,
    isServerConnected,
    getTools,
    refresh,
    connectSSE,
    disconnectSSE,
    finishAuth,
    callTool,
    listTools,
    listPrompts,
    getPrompt,
    listResources,
    readResource,
  };
}
