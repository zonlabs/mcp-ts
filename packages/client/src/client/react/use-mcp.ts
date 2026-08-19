/**
 * useMcp React Hook
 * Manages MCP connections with SSE-based real-time updates
 */

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { SSEClient, type SSEClientOptions } from '../core/sse-client';
import {
  getInitialConnectionState,
  getVisibleConnectionState,
  isTransientReconnectState,
} from '../utils/session-state';
import type { McpConnectionEvent, McpConnectionState } from '../../shared/events';
import { AUTH_REDIRECT_DEBOUNCE_MS } from '../../shared/constants';
import type {
  ToolInfo,
  FinishAuthResult,
  ListToolsRpcResult,
  ListPromptsResult,
  ListResourcesResult,
  ListResourceTemplatesResult,
  SessionInfo,
  ToolPolicy,
  SetToolPolicyResult,
  GetToolPolicyResult,
  ConnectParams,
} from '../../shared/types';

export interface UseMcpOptions {
  /**
   * SSE endpoint URL
   */
  url: string;

  /**
   * User/Client identifier
   */
  userId?: string;

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

  /**
   * Request timeout in milliseconds
   * @default 60000
   */
  requestTimeout?: number;

  /**
   * Enable client debug logs.
   * @default false
   */
  debug?: boolean;

}

export interface McpConnection {
  sessionId: string;
  serverId: string;
  serverName: string;
  serverUrl?: string;
  transport?: string;
  state: McpConnectionState;
  tools: ToolInfo[];
  allTools?: any[];
  prompts?: any[];
  resources?: any[];
  resourceTemplates?: any[];
  authUrl?: string;
  error?: string;
  createdAt?: Date;
  updatedAt?: Date;
  toolPolicy?: ToolPolicy;
  enabled?: boolean;
  /** Caller-supplied metadata, stored and returned opaquely. */
  metadata?: Record<string, string>;
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
  connect: (params: ConnectParams) => Promise<string>;

  /**
   * Disconnect from an MCP server
   */
  disconnect: (sessionId: string) => Promise<void>;

  /**
   * Reconnect to an MCP server (disconnects existing session first)
   */
  reconnect: (params: ConnectParams) => Promise<string>;

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
  finishAuth: (state: string, code: string, iss?: string) => Promise<FinishAuthResult>;

  /**
   * Explicitly resume OAuth flow for an existing session
   */
  resumeAuth: (sessionId: string) => Promise<void>;

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
   * Update per-session tool access policy
   */
  updateToolPolicy: (
    sessionId: string,
    toolPolicy: Pick<ToolPolicy, 'mode'> & { toolIds?: string[] }
  ) => Promise<SetToolPolicyResult>;

  /**
   * Get all tools and effective policy state for access management
   */
  getToolAccess: (sessionId: string) => Promise<GetToolPolicyResult>;

  /** Enable or disable a session for agent tool discovery. Tokens are preserved — no re-auth needed when re-enabling. */
  updateSession: (sessionId: string, enabled: boolean) => Promise<{ success: boolean }>;

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
   * List available resource templates
   */
  listResourceTemplates: (sessionId: string) => Promise<ListResourceTemplatesResult>;

  /**
   * Read a specific resource
   */
  readResource: (sessionId: string, uri: string) => Promise<unknown>;

  /**
   * Access the underlying SSEClient instance (for advanced usage like AppHost)
   */
  sseClient: SSEClient | null;
}

/**
 * React hook for MCP connection management with SSE
 */
export function useMcp(options: UseMcpOptions): McpClient {
  const {
    url,
    userId,
    authToken,
    autoConnect = true,
    autoInitialize = true,
    onConnectionEvent,
    onLog,
    onRedirect,
  } = options;

  const clientRef = useRef<SSEClient | null>(null);
  const isMountedRef = useRef(true);
  const suppressAuthRedirectSessionsRef = useRef<Set<string>>(new Set());
  const lastDispatchedAuthRef = useRef<Map<string, number>>(new Map());

  const [connections, setConnections] = useState<McpConnection[]>([]);
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>(
    'disconnected'
  );
  const [isInitializing, setIsInitializing] = useState(false);
  /** Mirrored from `clientRef` so the public `McpClient` object can be memoized when the instance is ready. */
  const [sseClient, setSseClient] = useState<SSEClient | null>(null);

  /**
   * Initialize SSE client
   */
  useEffect(() => {
    isMountedRef.current = true;

    const clientOptions: SSEClientOptions = {
      url,
      userId,
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
      debug: options.debug,
    };

    const client = new SSEClient(clientOptions);
    clientRef.current = client;
    setSseClient(client);

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
  }, [url, userId, authToken, autoConnect, autoInitialize]);

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
            // Normalize the incoming backend state into the smoother user-facing
            // state we want to render for this existing connection.
            const normalizedState = getVisibleConnectionState(event.state, existing.state, event.previousState);
            // In stateless per-request transport, tool calls can emit transient reconnect states.
            // Keep READY sticky to avoid UI flicker from READY -> CONNECTING -> CONNECTED.
            const nextState =
              existing.state === 'READY' && isTransientReconnectState(normalizedState)
                ? existing.state
                : normalizedState;

            const updatedAt = new Date();
            return prev.map((c: McpConnection) =>
              c.sessionId === event.sessionId ? {
                ...c,
                state: nextState,
                // update createdAt if present in event, otherwise keep existing
                createdAt: event.createdAt ? new Date(event.createdAt) : c.createdAt,
                updatedAt,
              } : c
            );
          } else {
            // Fix: Don't add back disconnected sessions that were just removed
            if (event.state === 'DISCONNECTED') {
              return prev;
            }

            return [
              ...prev,
              {
                sessionId: event.sessionId,
                serverId: event.serverId,
                serverName: event.serverName,
                serverUrl: event.serverUrl,
                // New connections do not have prior local state, so we normalize
                // only against the server-reported previous state.
                state: getVisibleConnectionState(event.state, undefined, event.previousState),
                createdAt: event.createdAt ? new Date(event.createdAt) : undefined,
                updatedAt: new Date(),
                tools: [],
              },
            ];
          }
        }

        case 'auth_required': {
          const url = (event.authUrl || '').trim();
          if (!url) {
            onLog?.('error', 'OAuth required but authorization URL is missing', { sessionId: event.sessionId });
            return prev.map((c: McpConnection) =>
              c.sessionId === event.sessionId
                ? {
                    ...c,
                    state: 'FAILED',
                    error: 'OAuth authorization URL not available',
                    authUrl: undefined,
                  }
                : c
            );
          }
          onLog?.('info', `OAuth required - redirecting to ${url}`, { authUrl: url });

          // Suppress redirects/popups for auto-restore on page load.
          if (!suppressAuthRedirectSessionsRef.current.has(event.sessionId)) {
            const now = Date.now();
            const lastDispatched = lastDispatchedAuthRef.current.get(event.sessionId);
            if (!lastDispatched || now - lastDispatched > AUTH_REDIRECT_DEBOUNCE_MS) {
              lastDispatchedAuthRef.current.set(event.sessionId, now);
              if (onRedirect) {
                onRedirect(url);
              } else if (typeof window !== 'undefined') {
                window.location.href = url;
              }
            }
          }
          const existing = prev.find((c: McpConnection) => c.sessionId === event.sessionId);
          if (existing) {
            return prev.map((c: McpConnection) =>
              c.sessionId === event.sessionId ? { ...c, state: 'AUTHENTICATING', authUrl: url } : c
            );
          }
          return [
            ...prev,
            {
              sessionId: event.sessionId,
              serverId: event.serverId,
              serverName: event.serverId,
              state: 'AUTHENTICATING' as const,
              authUrl: url,
              tools: [],
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ];
        }

        case 'error': {
          return prev.map((c: McpConnection) =>
            c.sessionId === event.sessionId ? { ...c, state: 'FAILED', error: event.error } : c
          );
        }

        case 'capabilities_discovered': {
          if (clientRef.current && event.tools?.length) {
            clientRef.current.preloadToolUiResources(event.sessionId, event.tools);
          }

          const existing = prev.find((c: McpConnection) => c.sessionId === event.sessionId);
          if (existing) {
            return prev.map((c: McpConnection) =>
              c.sessionId === event.sessionId
                ? {
                    ...c,
                    tools: event.tools,
                    allTools: (event as any).allTools,
                    prompts: (event as any).prompts,
                    resources: (event as any).resources,
                    resourceTemplates: (event as any).resourceTemplates,
                    state: 'READY' as const,
                    updatedAt: new Date(),
                  }
                : c
            );
          }
          return [
            ...prev,
            {
              sessionId: event.sessionId,
              serverId: event.serverId,
              serverName: event.serverId,
              tools: event.tools,
              allTools: (event as any).allTools,
              prompts: (event as any).prompts,
              resources: (event as any).resources,
              resourceTemplates: (event as any).resourceTemplates,
              state: 'READY' as const,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ];
        }

        case 'disconnected': {
          return prev.filter((c: McpConnection) => c.sessionId !== event.sessionId);
        }

        default:
          return prev;
      }
    });
  }, [onLog, onRedirect]);

  /**
   * Load sessions from server
   */
  const loadSessions = useCallback(async () => {
    if (!clientRef.current) return;

    try {
      setIsInitializing(true);

      const result = await clientRef.current.listSessions();
      const sessions = result.sessions || [];

      // Initialize connections (only active sessions; pending OAuth sessions are not restored on reload)
      if (isMountedRef.current) {
        setConnections(
          sessions
            .filter((s: SessionInfo) => s.status === 'active')
            .map((s: SessionInfo) => ({
              sessionId: s.sessionId,
              serverId: s.serverId ?? 'unknown',
              serverName: s.serverName ?? 'Unknown Server',
              serverUrl: s.serverUrl,
              transport: s.transport,
              state: getInitialConnectionState(s.status),
              createdAt: new Date(s.createdAt),
              updatedAt: new Date(s.updatedAt ?? s.createdAt),
              toolPolicy: s.toolPolicy,
              enabled: s.enabled,
              metadata: s.metadata,
              tools: [],
            }))
        );
      }

      // Validate each session in parallel
      await Promise.all(
        sessions.map(async (session: SessionInfo) => {
          if (clientRef.current) {
            try {
              // Pending auth sessions should not auto-trigger popup/redirect on reload.
              if (session.status !== 'active') {
                return;
              }
              suppressAuthRedirectSessionsRef.current.add(session.sessionId);
              await clientRef.current.getSession(session.sessionId);
            } catch (error) {
              console.error(`[useMcp] Failed to validate session ${session.sessionId}:`, error);
            } finally {
              suppressAuthRedirectSessionsRef.current.delete(session.sessionId);
            }
          }
        })
      );
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
    async (params: ConnectParams): Promise<string> => {
      if (!clientRef.current) {
        throw new Error('SSE client not initialized');
      }

      const result = await clientRef.current.connectToServer(params);
      return result.sessionId;
    },
    []
  );

  /**
   * Reconnect to an MCP server (tears down existing session, then connects fresh)
   */
  const reconnect = useCallback(
    async (params: ConnectParams): Promise<string> => {
      if (!clientRef.current) {
        throw new Error('SSE client not initialized');
      }

      const result = await clientRef.current.reconnectToServer(params);

      // The server emits connection events for the new session via SSE,
      // so local state is kept in sync automatically. No manual removal
      // of the old session or insertion of the new one needed here.

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
    lastDispatchedAuthRef.current.delete(sessionId);

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
  const finishAuth = useCallback(async (state: string, code: string, iss?: string): Promise<FinishAuthResult> => {
    if (!clientRef.current) {
      throw new Error('SSE client not initialized');
    }

    return await clientRef.current.finishAuth(state, code, iss);
  }, []);

  /**
   * Explicit user action to resume OAuth for an existing pending session.
   */
  const resumeAuth = useCallback(async (sessionId: string): Promise<void> => {
    if (!clientRef.current) {
      throw new Error('SSE client not initialized');
    }
    // Ensure this attempt is not suppressed as background restore.
    suppressAuthRedirectSessionsRef.current.delete(sessionId);
    await clientRef.current.getSession(sessionId);
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
   * Update tool access policy for a session
   */
  const updateToolPolicy = useCallback(async (
    sessionId: string,
    toolPolicy: Pick<ToolPolicy, 'mode'> & { toolIds?: string[] }
  ): Promise<SetToolPolicyResult> => {
    if (!clientRef.current) {
      throw new Error('SSE client not initialized');
    }

    const result = await clientRef.current.setToolPolicy(sessionId, toolPolicy);
    if (isMountedRef.current) {
      setConnections((prev: McpConnection[]) => prev.map((connection) =>
        connection.sessionId === sessionId
          ? {
              ...connection,
              toolPolicy: result.toolPolicy,
              tools: result.tools,
              updatedAt: new Date(),
            }
          : connection
      ));
    }
    return result;
  }, []);
  const updateSession = useCallback(async (
    sessionId: string,
    enabled: boolean,
  ): Promise<{ success: boolean }> => {
    if (!clientRef.current) {
      throw new Error('SSE client not initialized');
    }
    const result = await clientRef.current.updateSession(sessionId, enabled);
    if (isMountedRef.current) {
      setConnections((prev: McpConnection[]) => prev.map((connection) =>
        connection.sessionId === sessionId
          ? { ...connection, enabled, updatedAt: new Date() }
          : connection
      ));
    }
    return result;
  }, []);
  /**
   * Get all tools with effective access state for a session
   */
  const getToolAccess = useCallback(async (sessionId: string): Promise<GetToolPolicyResult> => {
    if (!clientRef.current) {
      throw new Error('SSE client not initialized');
    }

    return await clientRef.current.getToolPolicy(sessionId);
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
   * List resource templates
   */
  const listResourceTemplates = useCallback(async (sessionId: string): Promise<ListResourceTemplatesResult> => {
    if (!clientRef.current) {
      throw new Error('SSE client not initialized');
    }

    return await clientRef.current.listResourceTemplates(sessionId);
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
      return conn ? conn.state === 'CONNECTED' || conn.state === 'DISCOVERING' || conn.state === 'READY' : false;
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

  return useMemo(
    () => ({
      connections,
      status,
      isInitializing,
      connect,
      reconnect,
      disconnect,
      getConnection,
      getConnectionByServerId,
      isServerConnected,
      getTools,
      refresh,
      connectSSE,
      disconnectSSE,
      finishAuth,
      resumeAuth,
      callTool,
      listTools,
      updateToolPolicy,
      getToolAccess,
      updateSession,
      listPrompts,
      getPrompt,
      listResources,
      listResourceTemplates,
      readResource,
      sseClient,
    }),
    [
      connections,
      status,
      isInitializing,
      connect,
      reconnect,
      disconnect,
      getConnection,
      getConnectionByServerId,
      isServerConnected,
      getTools,
      refresh,
      connectSSE,
      disconnectSSE,
      finishAuth,
      resumeAuth,
      callTool,
      listTools,
      updateToolPolicy,
      getToolAccess,
      updateSession,
      listPrompts,
      getPrompt,
      listResources,
      listResourceTemplates,
      readResource,
      sseClient,
    ]
  );
}





