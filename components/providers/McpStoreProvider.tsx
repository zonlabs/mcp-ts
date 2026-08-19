'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useMcpStore, type McpStore } from '@/lib/stores/mcp-store';
import { useMcp } from '@mcp-ts/client/react';
import type { ToolAccessResult, ToolPolicy } from '@/types/mcp';
import { useAuth } from '@/components/providers/AuthProvider';
import { setMcpClient } from '@/lib/mcp-client-store';

import { openAuthPopup } from '@/lib/auth-popup-utils';

type McpHookWithToolPolicy = ReturnType<typeof useMcp> & {
  getToolAccess?: (sessionId: string) => Promise<ToolAccessResult>;
  updateToolPolicy?: (
    sessionId: string,
    policy: { mode: ToolPolicy["mode"]; toolIds?: string[] }
  ) => Promise<ToolAccessResult>;
};
/**
 * MCP Store Provider
 * Initializes the Zustand store with data on mount
 * Validates persisted connections and fetches user servers
 */
export function McpStoreProvider({ children }: { children: React.ReactNode }) {
  const { userSession } = useAuth();
  const userId = userSession?.user?.id;

  if (!userId) {
    return <>{children}</>;
  }

  return <McpStoreProviderInner userId={userId}>{children}</McpStoreProviderInner>;
}

function McpStoreProviderInner({
  children,
  userId,
}: {
  children: React.ReactNode;
  userId: string;
}) {
  const fetchUserServers = useMcpStore((state: McpStore) => state.fetchUserServers);
  const authInFlightStatesRef = useRef<Set<string>>(new Set());

  // Initialize MCP Hook globally
  const {
    connections,
    connect,
    disconnect,
    reconnect,
    callTool,
    finishAuth,
    sseClient,
    getToolAccess: _sdkGetToolAccess,
    updateToolPolicy,
    updateSession,
    listPrompts,
    getPrompt,
    listResources,
    listResourceTemplates,
    readResource,
  } = useMcp({
    url: '/api/mcp/sse',
    userId,
    autoConnect: true,
    onRedirect: (url: string) => {
      void (async () => {
        let state: string | null = null;
        let ownsInFlightState = false;
        try {
          const parsed = new URL(url);
          state = parsed.searchParams.get('state');
          if (!state) return;

          if (authInFlightStatesRef.current.has(state)) return;
          authInFlightStatesRef.current.add(state);
          ownsInFlightState = true;

          const authResult = await openAuthPopup({ url });

          if (authResult.code && (authResult.sessionId || authResult.state || state)) {
            const authState = authResult.sessionId || authResult.state || state;
            await finishAuth(authState, authResult.code);
          }
        } catch (error) {
          const targetSessionId = state ? (state.includes('.') ? state.split('.')[1] : state) : null;
          if (targetSessionId) {
            try {
              await disconnect(targetSessionId);
            } catch {
              // ignore
            }
          }

          // Clean up only the specific failed session from Zustand store
          if (targetSessionId) {
            const store = useMcpStore.getState();
            if (store.connections[targetSessionId] && store.connections[targetSessionId].connectionStatus !== 'READY') {
              const updatedConns = { ...store.connections };
              delete updatedConns[targetSessionId];
              useMcpStore.setState({
                connections: updatedConns,
                activeConnectionCount: Object.values(updatedConns).filter((c) => c.connectionStatus === 'READY').length,
              });
            }
          }
        } finally {
          if (state && ownsInFlightState) {
            authInFlightStatesRef.current.delete(state);
          }
        }
      })();
    },
  }) as McpHookWithToolPolicy;

  // Custom getToolAccess that computes the result using pre-loaded store connection states,
  // completely bypassing the slow getToolPolicy RPC call over SSE.
  const getToolAccess = useCallback(async (sessionId: string): Promise<ToolAccessResult> => {
    const storeState = useMcpStore.getState();
    const connection = storeState.connections[sessionId];
    if (!connection) {
      throw new Error("Connection not found");
    }

    const serverId = connection.serverId;
    const targetTools = connection.allTools && connection.allTools.length > 0
      ? connection.allTools
      : connection.tools || [];
    const targetPolicy = connection.toolPolicy ?? { mode: "all", toolIds: [] };

    const tools = targetTools.map((t) => {
      const toolId = (t as any).toolId || (serverId ? `${serverId}::${t.name}` : t.name);
      return {
        ...t,
        toolId,
        allowed: targetPolicy.mode === "all"
          ? true
          : targetPolicy.mode === "allowlist"
            ? targetPolicy.toolIds.includes(toolId)
            : !targetPolicy.toolIds.includes(toolId),
      };
    });

    return {
      toolPolicy: targetPolicy,
      tools,
      toolCount: targetTools.length,
      allowedToolCount: tools.filter((t) => t.allowed).length,
    };
  }, []);

  const syncConnections = useMcpStore(state => state.syncConnections);
  const setMcpActions = useMcpStore(state => state.setMcpActions);

  // Sync actions to store once (or when they change)
  useEffect(() => {
    setMcpActions({ connect, disconnect, reconnect, callTool, finishAuth, getToolAccess, updateToolPolicy, updateSession, listPrompts, getPrompt, listResources, listResourceTemplates, readResource });
  }, [connect, disconnect, reconnect, callTool, finishAuth, getToolAccess, updateToolPolicy, updateSession, listPrompts, getPrompt, listResources, listResourceTemplates, readResource, setMcpActions]);

  // Sync state to store whenever connections change
  useEffect(() => {
    syncConnections(connections as any);
  }, [connections, syncConnections]);

  useEffect(() => {
    void fetchUserServers();
  }, [fetchUserServers]);

  useEffect(() => {
    setMcpClient({ connections, sseClient });
  }, [connections, sseClient]);

  return <>{children}</>;
}
