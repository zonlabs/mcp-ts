'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ServerIcon } from '../common/ServerIcon';
import { useMcpStore } from '@/lib/stores/mcp-store';

interface MCPConnectionApprovalProps {
  serverName: string;
  serverUrl: string;
  serverId: string;
  transportType: string;
  approvalId: string;
  onApprove: (data: any) => void;
  onDeny: () => void;
}

/**
 * Get user-friendly status message for connection phase
 */


export function MCPConnectionApproval({
  serverName,
  serverUrl,
  serverId,
  transportType,
  approvalId,
  onApprove,
  onDeny,
}: MCPConnectionApprovalProps) {
  const [connectRequested, setConnectRequested] = useState(false);

  // Use the global store for actions and live connection state
  const connectServer = useMcpStore(state => state.connect);
  const connections = useMcpStore(state => state.connections);

  const normalizeServerUrl = (url?: string | null): string | null => {
    if (!url) return null;
    try {
      const parsed = new URL(url.trim());
      const path = parsed.pathname.replace(/\/+$/, '') || '/';
      return `${parsed.origin}${path}${parsed.search}`;
    } catch {
      return url.trim().replace(/\/+$/, '');
    }
  };

  // Check if we already have a connection for this server
  const normalizedTargetUrl = normalizeServerUrl(serverUrl);
  const existingConnection = Object.values(connections).find((conn) => {
    if (conn.serverId === serverId) return true;
    if (!normalizedTargetUrl) return false;
    return normalizeServerUrl(conn.url) === normalizedTargetUrl;
  });
  const isConnected = existingConnection?.connectionStatus === 'READY';
  const isStatusConnecting = !!existingConnection?.connectionStatus && [
    'INITIALIZING',
    'VALIDATING',
    'CONNECTING',
    'AUTHENTICATING',
    'AUTHENTICATED',
    'CONNECTED',
    'DISCOVERING',
  ].includes(existingConnection.connectionStatus);
  const isTerminalState =
    existingConnection?.connectionStatus === 'READY' ||
    existingConnection?.connectionStatus === 'FAILED' ||
    existingConnection?.connectionStatus === 'DISCONNECTED';
  const isConnecting = isStatusConnecting || (connectRequested && !isTerminalState);

  // Watch for successful connection
  const [hasTriggeredApprove, setHasTriggeredApprove] = useState(false);
  useEffect(() => {
    if (!connectRequested || !isConnected || hasTriggeredApprove || !existingConnection?.sessionId) return;
    console.log('[MCPConnectionApproval] Auto-approving tool after READY state', {
      serverName,
      serverUrl,
      sessionId: existingConnection.sessionId,
      status: existingConnection.connectionStatus,
    });
    setHasTriggeredApprove(true);
    onApprove({ sessionId: existingConnection.sessionId });
  }, [connectRequested, isConnected, hasTriggeredApprove, existingConnection?.sessionId, existingConnection?.connectionStatus, onApprove, serverName, serverUrl]);

  useEffect(() => {
    const handleOAuthSuccess = (event: Event) => {
      if (hasTriggeredApprove) return;

      const customEvent = event as CustomEvent<{ state?: string; serverUrl?: string; sessionId?: string }>;
      const matchedByUrl =
        !!customEvent.detail?.serverUrl && customEvent.detail.serverUrl === serverUrl;

      // Ignore OAuth success events for other servers.
      if (!matchedByUrl && customEvent.detail?.serverUrl) return;

      // Mark this approval card as actively connecting; approval still waits for READY.
      console.log('[MCPConnectionApproval] OAuth success event received', {
        serverName,
        serverUrl,
        state: customEvent.detail?.state,
        sessionId: customEvent.detail?.sessionId,
      });
      setConnectRequested(true);

      // OAuth code exchange is already complete at this point; approve immediately to resume agent flow.
      if (customEvent.detail?.sessionId) {
        console.log('[MCPConnectionApproval] Approving immediately after OAuth success', {
          sessionId: customEvent.detail.sessionId,
        });
        setHasTriggeredApprove(true);
        onApprove({ sessionId: customEvent.detail.sessionId });
      }
    };

    window.addEventListener('mcp-oauth-success', handleOAuthSuccess);
    return () => {
      window.removeEventListener('mcp-oauth-success', handleOAuthSuccess);
    };
  }, [hasTriggeredApprove, onApprove, serverName, serverUrl]);

  const handleConnect = async () => {
    console.log('[MCPConnectionApproval] Connect button clicked', {
      serverName,
      serverUrl,
      serverId,
      transportType,
    });
    setConnectRequested(true);
    try {
      await connectServer({
        id: serverId,
        name: serverName,
        url: serverUrl,
        transport: transportType,
      } as any); // Cast to McpServer type as needed
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const isExpectedOAuthTransition =
        message.toLowerCase().includes('oauth authorization required');

      if (isExpectedOAuthTransition) {
        // OAuth popup flow continues via useMcp.onRedirect; do not deny tool approval.
        return;
      }

      console.error('[MCPConnectionApproval] Connection failed:', error);
    }
  };

  return (
    <div className="flex items-center justify-between p-4 bg-background border border-border rounded-lg shadow-sm animate-in fade-in slide-in-from-bottom-2 max-w-2xl">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <ServerIcon
          serverName={serverName}
          serverUrl={serverUrl}
          size={40}
          className="rounded-lg flex-shrink-0"
        />
        <div className="flex flex-col min-w-0 flex-1">
          <span className="text-base font-semibold text-foreground truncate">
            {serverName}
          </span>
          <span className="text-xs text-muted-foreground truncate">{serverUrl}</span>
        </div>
      </div>
      <div className="flex gap-2">
        <Button
          size="default"
          onClick={onDeny}
          variant="outline"
          disabled={isConnecting}
        >
          Deny
        </Button>
        <Button
          size="default"
          onClick={handleConnect}
          variant="default"
          className="cursor-pointer gap-2"
          disabled={isConnecting}
        >
          {isConnecting ? (
            <>
              <span className="text-sm">Connecting...</span>
              <svg
                className="animate-spin"
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
            </>
          ) : (
            'Connect'
          )}
        </Button>
      </div>
    </div>
  );
}
