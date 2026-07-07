'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useMcpStore, type McpStore } from '@/lib/stores/mcp-store';
import { useMcp } from '@mcp-ts/sdk/client/react';
import type { ToolAccessResult, ToolPolicy } from '@/types/mcp';
import { useAuth } from '@/components/providers/AuthProvider';
import { openAuthPopup } from '@/lib/auth-popup-utils';
import { setMcpClient } from '@/lib/mcp-client-store';

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
  const authSuccessDispatchedStatesRef = useRef<Set<string>>(new Set());

  // Initialize MCP Hook globally
  const {
    connections,
    connect,
    disconnect,
    reconnect,
    callTool,
    finishAuth,
    resumeAuth,
    sseClient,
    getToolAccess: _sdkGetToolAccess,
    updateToolPolicy,
    updateSession,
    listPrompts,
    listResources,
    readResource,
  } = useMcp({
    url: '/api/mcp/sse',
    userId,
    autoConnect: true,
    onRedirect: (url: string) => {
      void (async () => {
        let state: string | null = null;
        let serverUrl: string | null = null;
        let ownsInFlightState = false;
        try {
          const parsed = new URL(url);
          state = parsed.searchParams.get('state');
          serverUrl = parsed.searchParams.get('resource');
          if (!state) {
            return;
          }

          if (authInFlightStatesRef.current.has(state)) {
            return;
          }
          authInFlightStatesRef.current.add(state);
          ownsInFlightState = true;

          const authResult = await openAuthPopup({
            url,
            windowName: `mcp-auth-popup-${state}`,
          });

          if (authResult.code && (authResult.sessionId || authResult.state || state)) {
            const authState = authResult.sessionId || authResult.state || state;
            await finishAuth(authState, authResult.code);
          } else if (authResult.sessionId) {
            await resumeAuth(authResult.sessionId);
          }

          // Notify UI components (e.g. playground approval card) that OAuth completed.
          if (!authSuccessDispatchedStatesRef.current.has(state)) {
            authSuccessDispatchedStatesRef.current.add(state);
            window.dispatchEvent(
              new CustomEvent('mcp-oauth-success', {
                detail: {
                  state,
                  sessionId: authResult.sessionId || authResult.state || state,
                  serverUrl: authResult.serverUrl || parsed.searchParams.get('resource') || undefined,
                },
              })
            );
          }
        } catch (error) {
          window.dispatchEvent(
            new CustomEvent('mcp-oauth-cancelled', {
              detail: {
                state,
                serverUrl,
                reason: error instanceof Error ? error.message : String(error),
              },
            })
          );
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
    setMcpActions({ connect, disconnect, reconnect, callTool, getToolAccess, updateToolPolicy, updateSession, listPrompts, listResources, readResource });
  }, [connect, disconnect, reconnect, callTool, getToolAccess, updateToolPolicy, updateSession, listPrompts, listResources, readResource, setMcpActions]);

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
