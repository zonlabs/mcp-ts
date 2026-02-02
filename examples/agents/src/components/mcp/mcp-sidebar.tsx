'use client';

import { useState, useRef } from 'react';
import { useMcpContext } from './mcp-provider';
import { ConnectForm } from './connect-form';
import { ConnectionList } from './connection-list';
import { useOAuthPopup } from './use-oauth-popup';
import { Connection, ConnectConfig } from './types';
import { Wifi, WifiOff } from 'lucide-react';

interface McpSidebarProps {
  identity?: string;
  authToken?: string;
}

export function McpSidebar(_props: McpSidebarProps = {}) {
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const popupRef = useRef<Window | null>(null);

  // Use shared MCP context instead of creating a new useMcp instance
  const { mcpClient } = useMcpContext();
  const {
    connections,
    status,
    isInitializing,
    connect,
    disconnect,
    finishAuth,
  } = mcpClient;

  useOAuthPopup(connections as Connection[], finishAuth);

  const handleConnect = async (config: ConnectConfig) => {
    setConnecting(true);
    setConnectError(null);

    try {
      await connect({
        serverId: config.serverId || crypto.randomUUID(),
        serverName: config.serverName,
        serverUrl: config.serverUrl,
        callbackUrl: config.callbackUrl,
        transportType: config.transportType === 'auto' ? undefined : config.transportType
      });
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : 'Failed to connect');
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async (sessionId: string) => {
    try {
      await disconnect(sessionId);
    } catch (err) {
      console.error('Failed to disconnect:', err);
    }
  };

  return (
    <div className="h-full flex flex-col bg-zinc-950 border-r border-zinc-800">
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <h1 className="text-sm font-semibold text-zinc-100">(@mcp-ts, AGUI and Langgraph Deepagents)</h1>
        <div className="flex items-center gap-1.5">
          {status === 'connected' ? (
            <Wifi className="w-4 h-4 text-green-500" />
          ) : (
            <WifiOff className="w-4 h-4 text-zinc-500" />
          )}
          <span className={`text-xs ${status === 'connected' ? 'text-green-500' : 'text-zinc-500'}`}>
            {status}
          </span>
        </div>
      </div>

      <ConnectForm
        onConnect={handleConnect}
        connecting={connecting}
        status={status}
        error={connectError}
      />

      <ConnectionList
        connections={connections as Connection[]}
        isInitializing={isInitializing}
        onDisconnect={handleDisconnect}
      />
    </div>
  );
}
