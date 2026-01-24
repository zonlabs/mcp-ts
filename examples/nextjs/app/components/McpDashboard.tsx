'use client';

import { useState, useRef } from 'react';
import { useMcp } from '@mcp-ts/redis/client';
import styles from './McpDashboard.module.css';
import ConnectForm from './dashboard/ConnectForm';
import ConnectionList from './dashboard/ConnectionList';
import ToolExecutor from './dashboard/ToolExecutor';
import McpHeader from './dashboard/McpHeader';
import { useOAuthPopup } from './dashboard/useOAuthPopup';
import { Connection, ConnectConfig } from './dashboard/types';

export default function McpDashboard() {
  const [identity] = useState('demo-user-123');
  const [authToken] = useState('demo-auth-token');

  // Tool execution state
  const [selectedTool, setSelectedTool] = useState<{
    sessionId: string;
    toolName: string;
  } | null>(null);

  // Connect/State loading
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  // Popup reference for OAuth
  const popupRef = useRef<Window | null>(null);

  const {
    connections,
    status,
    isInitializing,
    connect,
    disconnect,
    callTool,
    finishAuth,
  } = useMcp({
    url: '/api/mcp',
    identity,
    authToken,
    autoConnect: true,
    autoInitialize: true, // Auto-load sessions on mount
    onLog: (level, message, metadata) => {
      console.log(`[${level}] ${message}`, metadata);
    },
    // Handle OAuth redirect with a popup
    onRedirect: (url) => {
      // Calculate center position
      const width = 600;
      const height = 700;
      const left = window.screen.width / 2 - width / 2;
      const top = window.screen.height / 2 - height / 2;

      const popup = window.open(
        url,
        'mcp-auth-popup',
        `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes,status=yes`
      );

      if (popup) {
        popupRef.current = popup;
      } else {
        alert('Popup blocked! Please allow popups for this site to complete authentication.');
      }
    }
  });

  // Use custom hook for OAuth popup logic
  useOAuthPopup(connections as Connection[], finishAuth);

  // Handler for ConnectForm
  const handleConnect = async (config: ConnectConfig) => {
    setConnecting(true);
    setConnectError(null);

    try {
      await connect({
        serverId: config.serverId,
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

  const handleSelectTool = (sessionId: string, toolName: string) => {
    setSelectedTool({ sessionId, toolName });
  };

  const handleExecuteTool = async (sessionId: string, toolName: string, toolArgs: string) => {
    try {
      const args = JSON.parse(toolArgs);
      const result = await callTool(sessionId, toolName, args);
      return result;
    } catch (err) {
      return {
        error: err instanceof Error ? err.message : 'Tool execution failed'
      };
    }
  };

  // State for tool execution result
  const [toolResult, setToolResult] = useState<any>(null);
  const [isExecuting, setIsExecuting] = useState(false);

  const executeToolWrapper = async (sessionId: string, toolName: string, toolArgs: string) => {
    setIsExecuting(true);
    setToolResult(null);
    const result = await handleExecuteTool(sessionId, toolName, toolArgs);
    setToolResult(result);
    setIsExecuting(false);
    return result;
  };

  return (
    <div className={styles.container}>
      <McpHeader status={status} />

      <div className={styles.grid}>
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
          onSelectTool={handleSelectTool}
        />

        {/* Info Section */}
        <section className={`${styles.card} ${styles.infoCard}`}>
          <h2>About This Example</h2>
          <p>
            This example demonstrates how to use <code>@mcp-ts/redis</code> in a Next.js application.
          </p>
          <h3>Features</h3>
          <ul>
            <li>Server-side SSE endpoint for real-time updates</li>
            <li>Client-side React hook for managing connections</li>
            <li>OAuth 2.0 authentication flow</li>
            <li>Redis-backed session persistence</li>
            <li>Tool discovery and execution</li>
          </ul>
          <h3>Architecture</h3>
          <ul>
            <li><strong>Server:</strong> <code>app/api/mcp/route.ts</code> - SSE handler</li>
            <li><strong>Client:</strong> <code>app/components/McpDashboard.tsx</code> - useMcp hook</li>
            <li><strong>Redis:</strong> Session storage (configure via REDIS_URL env var)</li>
          </ul>
          <h3>Setup Required</h3>
          <ol>
            <li>Set <code>REDIS_URL</code> environment variable</li>
            <li>Configure an MCP server to connect to</li>
            <li>Update OAuth callback URL in your MCP server settings</li>
          </ol>
        </section>
      </div>

      <ToolExecutor
        selectedTool={selectedTool}
        onClose={() => {
          setSelectedTool(null);
          setToolResult(null);
        }}
        onExecute={executeToolWrapper}
        isExecuting={isExecuting}
        toolResult={toolResult}
      />
    </div>
  );
}
