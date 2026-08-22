'use client';

import React, { createContext, useContext, useMemo, useRef, useCallback } from 'react';
import { useMcp, type McpConnection } from '@mcp-ts/client/react';
import type { ToolAccessResult, ToolPolicy } from '@/types/mcp';
import { useAuth } from '@/components/providers/AuthProvider';
import { openAuthPopup } from '@/lib/auth-popup-utils';

export type ConnectParams = Parameters<ReturnType<typeof useMcp>['connect']>[0];

export interface McpContextValue {
  connections: McpConnection[];
  connectionMap: Record<string, McpConnection>;
  activeConnections: McpConnection[];
  activeConnectionCount: number;
  status: 'connecting' | 'connected' | 'disconnected' | 'error';
  isInitializing: boolean;
  connect: (params: ConnectParams) => Promise<string>;
  disconnect: (sessionId: string) => Promise<void>;
  reconnect: (params: ConnectParams) => Promise<string>;
  callTool: (sessionId: string, toolName: string, args?: Record<string, unknown>) => Promise<unknown>;
  finishAuth: (state: string, code: string, iss?: string) => Promise<unknown>;
  updateToolPolicy: (
    sessionId: string,
    policy: { mode: ToolPolicy['mode']; toolIds?: string[] }
  ) => Promise<unknown>;
  getToolAccess: (sessionId: string) => Promise<ToolAccessResult>;
  updateSession: (sessionId: string, enabled: boolean) => Promise<{ success: boolean }>;
  listPrompts: (sessionId: string) => Promise<unknown>;
  getPrompt: (sessionId: string, name: string, args?: Record<string, string>) => Promise<unknown>;
  listResources: (sessionId: string) => Promise<unknown>;
  listResourceTemplates: (sessionId: string) => Promise<unknown>;
  readResource: (sessionId: string, uri: string) => Promise<unknown>;
  sseClient: unknown;
  refresh: () => Promise<void>;
}

const McpContext = createContext<McpContextValue | null>(null);

export function useMcpContext(): McpContextValue {
  const context = useContext(McpContext);
  if (!context) {
    throw new Error('useMcpContext must be used within an McpProvider');
  }
  return context;
}

export function McpProvider({ children }: { children: React.ReactNode }) {
  const { userSession } = useAuth();
  const userId = userSession?.user?.id;

  if (!userId) {
    return <>{children}</>;
  }

  return <McpProviderInner userId={userId}>{children}</McpProviderInner>;
}

function McpProviderInner({
  children,
  userId,
}: {
  children: React.ReactNode;
  userId: string;
}) {
  const authInFlightStatesRef = useRef<Set<string>>(new Set());

  const mcp = useMcp({
    url: '/api/mcp/sse',
    userId,
    autoConnect: true,
    onRedirect: (url: string) => {
      void (async () => {
        let state: string | null = null;
        try {
          const parsed = new URL(url);
          state = parsed.searchParams.get('state');
          if (!state) return;

          if (authInFlightStatesRef.current.has(state)) return;
          authInFlightStatesRef.current.add(state);

          const authResult = await openAuthPopup({ url });

          if (authResult.code && (authResult.sessionId || authResult.state || state)) {
            const authState = authResult.sessionId || authResult.state || state;
            await mcp.finishAuth(authState, authResult.code);
          }
        } catch (error) {
          const targetSessionId = state ? (state.includes('.') ? state.split('.')[1] : state) : null;
          if (targetSessionId) {
            try {
              await mcp.disconnect(targetSessionId);
            } catch {
              // ignore
            }
          }
        } finally {
          if (state) {
            authInFlightStatesRef.current.delete(state);
          }
        }
      })();
    },
  });

  const connectionMap = useMemo(() => {
    const map: Record<string, McpConnection> = {};
    for (const conn of mcp.connections) {
      map[conn.sessionId] = conn;
    }
    return map;
  }, [mcp.connections]);

  const activeConnections = useMemo(() => {
    return mcp.connections.filter((c) => c.state === 'READY');
  }, [mcp.connections]);

  const activeConnectionCount = activeConnections.length;

  const getToolAccess = useCallback(async (sessionId: string): Promise<ToolAccessResult> => {
    const conn = connectionMap[sessionId];
    const rawTools = (conn as any)?.allTools || conn?.tools || [];
    const policy = conn?.toolPolicy || { mode: 'all' as const, toolIds: [] };

    return {
      toolPolicy: policy,
      tools: rawTools.map((t: any) => ({
        ...t,
        toolId: t.id || t.name,
        allowed: true,
      })),
      toolCount: rawTools.length,
      allowedToolCount: rawTools.length,
    };
  }, [connectionMap]);

  const updateToolPolicy = useCallback(async (
    sessionId: string,
    policy: { mode: ToolPolicy['mode']; toolIds?: string[] }
  ) => {
    if (typeof mcp.updateToolPolicy === 'function') {
      return mcp.updateToolPolicy(sessionId, policy);
    }
    return null;
  }, [mcp]);

  const callTool = useCallback(async (
    sessionId: string,
    toolName: string,
    args?: Record<string, unknown>
  ): Promise<unknown> => {
    return mcp.callTool(sessionId, toolName, args ?? {});
  }, [mcp]);

  const contextValue = useMemo<McpContextValue>(() => ({
    connections: mcp.connections,
    connectionMap,
    activeConnections,
    activeConnectionCount,
    status: mcp.status,
    isInitializing: mcp.isInitializing,
    connect: mcp.connect,
    disconnect: mcp.disconnect,
    reconnect: mcp.reconnect,
    callTool,
    finishAuth: mcp.finishAuth,
    updateToolPolicy,
    getToolAccess,
    updateSession: mcp.updateSession,
    listPrompts: mcp.listPrompts,
    getPrompt: mcp.getPrompt,
    listResources: mcp.listResources,
    listResourceTemplates: mcp.listResourceTemplates,
    readResource: mcp.readResource,
    sseClient: mcp.sseClient,
    refresh: mcp.refresh,
  }), [
    mcp.connections,
    connectionMap,
    activeConnections,
    activeConnectionCount,
    mcp.status,
    mcp.isInitializing,
    mcp.connect,
    mcp.disconnect,
    mcp.reconnect,
    callTool,
    mcp.finishAuth,
    updateToolPolicy,
    getToolAccess,
    mcp.updateSession,
    mcp.listPrompts,
    mcp.getPrompt,
    mcp.listResources,
    mcp.listResourceTemplates,
    mcp.readResource,
    mcp.sseClient,
    mcp.refresh,
  ]);

  return <McpContext.Provider value={contextValue}>{children}</McpContext.Provider>;
}
