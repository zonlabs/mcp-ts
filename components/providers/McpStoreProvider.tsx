'use client';

import { useEffect, useRef } from 'react';
import { useMcpStore, type McpStore } from '@/lib/stores/mcp-store';
import { useMcp } from '@mcp-ts/sdk/client/react';
import { useAuth } from '@/components/providers/AuthProvider';
import { openAuthPopup } from '@/lib/auth-popup-utils';

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
    callTool,
    finishAuth,
    resumeAuth,
  } = useMcp({
    url: '/api/mcp/sse',
    identity: userId,
    autoConnect: true,
    onRedirect: (url: string) => {
      void (async () => {
        let state: string | null = null;
        let serverUrl: string | null = null;
        try {
          const parsed = new URL(url);
          state = parsed.searchParams.get('state');
          serverUrl = parsed.searchParams.get('resource');
          if (!state) {
            console.warn('[MCP OAuth] Ignoring redirect without state:', url);
            return;
          }

          if (authInFlightStatesRef.current.has(state)) {
            return;
          }
          authInFlightStatesRef.current.add(state);

          const authResult = await openAuthPopup({
            url,
            windowName: `mcp-auth-popup-${state}`,
          });

          if (authResult.code && (authResult.state || state)) {
            const authState = authResult.state || state;
            await finishAuth(authState, authResult.code);
            await resumeAuth(authState);
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
                  sessionId: authResult.sessionId,
                  serverUrl: authResult.serverUrl || parsed.searchParams.get('resource') || undefined,
                },
              })
            );
          }
        } catch (error) {
          console.error('[MCP OAuth] Popup flow failed:', error);
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
          if (state) {
            authInFlightStatesRef.current.delete(state);
          }
        }
      })();
    },
  });

  const syncConnections = useMcpStore(state => state.syncConnections);
  const setMcpActions = useMcpStore(state => state.setMcpActions);

  // Sync actions to store once (or when they change)
  useEffect(() => {
    setMcpActions({ connect, disconnect, callTool });
  }, [connect, disconnect, callTool, setMcpActions]);

  // Sync state to store whenever connections change
  useEffect(() => {
    syncConnections(connections as any);
  }, [connections, syncConnections]);

  useEffect(() => {
    // On mount: fetch user servers
    const initializeConnections = async () => {
      // Fetch user servers
      await fetchUserServers();
    };

    initializeConnections();
  }, [fetchUserServers]);

  useEffect(() => {
    return () => {};
  }, []);

  return <>{children}</>;
}
