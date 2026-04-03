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
  const [showUrl, setShowUrl] = useState(false);
  const [denied, setDenied] = useState(false);

  // Use the global store for actions and live connection state
  const connectServer = useMcpStore(state => state.connect);
  const disconnectServer = useMcpStore(state => state.disconnect);
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
  const isStaleConnecting = isStatusConnecting && !connectRequested;
  const isConnecting = !denied && !isStaleConnecting && (isStatusConnecting || (connectRequested && !isTerminalState));

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

  useEffect(() => {
    const handleOAuthCancelled = (event: Event) => {
      const customEvent = event as CustomEvent<{ state?: string; serverUrl?: string; reason?: string }>;
      const matchedByUrl =
        !!customEvent.detail?.serverUrl && customEvent.detail.serverUrl === serverUrl;

      if (!matchedByUrl && customEvent.detail?.serverUrl) return;
      setConnectRequested(false);
      setDenied(true);
    };

    window.addEventListener('mcp-oauth-cancelled', handleOAuthCancelled);
    return () => {
      window.removeEventListener('mcp-oauth-cancelled', handleOAuthCancelled);
    };
  }, [serverUrl]);

  const handleConnect = async () => {
    console.log('[MCPConnectionApproval] Connect button clicked', {
      serverName,
      serverUrl,
      serverId,
      transportType,
    });
    setDenied(false);
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
    <div className="w-full max-w-none sm:max-w-2xl flex flex-col gap-2 p-2 sm:p-3 bg-background rounded-lg animate-in fade-in slide-in-from-bottom-2">
      <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <ServerIcon
            serverName={serverName}
            serverUrl={serverUrl}
            size={30}
            className="rounded-lg flex-shrink-0"
          />
          <div className="min-w-0 flex-1">
            <button
              type="button"
              onClick={() => setShowUrl((v) => !v)}
              className="min-w-0 text-left text-[15px] sm:text-base font-semibold text-foreground leading-tight hover:text-foreground/80 transition-colors"
            >
              <span className="truncate block">{serverName}</span>
            </button>
          </div>
        </div>

        <div className="flex gap-1.5 shrink-0">
          <Button
            size="sm"
            onClick={() => {
              setDenied(true);
              setConnectRequested(false);
              if (existingConnection?.sessionId) {
                void disconnectServer(existingConnection.sessionId);
              }
              onDeny();
            }}
            variant="outline"
            disabled={false}
            className="h-8 px-3 text-xs sm:text-sm"
          >
            Deny
          </Button>
          <Button
            size="sm"
            onClick={handleConnect}
            variant="default"
            className="cursor-pointer gap-1 sm:gap-2 h-8 px-3 text-xs sm:text-sm"
            disabled={isConnecting}
          >
            {isConnecting ? (
              <>
                <span className="text-xs sm:text-sm">Connecting...</span>
                <svg
                  className="animate-spin"
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
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

      <p className="text-xs text-muted-foreground font-semibold">
        Please connect to continue.
      </p>
      {denied && (
        <p className="text-xs text-red-600 dark:text-red-400 font-medium">
          Connection request cancelled.
        </p>
      )}

      {showUrl && (
        <p className="pl-[42px] sm:pl-[46px] text-[10px] sm:text-xs text-muted-foreground break-all" title={serverUrl}>
          {serverUrl}
        </p>
      )}
    </div>
  );
}
