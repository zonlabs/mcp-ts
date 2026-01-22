import { useState } from 'react';
import type { McpConnection, ToolInfo } from '@mcp-assistant/mcp-redis/shared';
import ToolList from './ToolList';

interface ConnectionCardProps {
  connection: McpConnection;
  onDisconnect: (sessionId: string) => Promise<void>;
  onCallTool: (sessionId: string, toolName: string, args: Record<string, unknown>) => Promise<unknown>;
}

export default function ConnectionCard({ connection, onDisconnect, onCallTool }: ConnectionCardProps) {
  const [disconnecting, setDisconnecting] = useState(false);

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      await onDisconnect(connection.sessionId);
    } catch (error) {
      console.error('Failed to disconnect:', error);
      setDisconnecting(false);
    }
  };

  return (
    <div className="connection-card">
      <div className="connection-header">
        <div className="connection-info">
          <h3>{connection.serverName}</h3>
          <div className="connection-meta">
            <span className="session-id">Session: {connection.sessionId.slice(0, 8)}...</span>
            <span className={`state-badge state-${connection.state.toLowerCase()}`}>
              {connection.state}
            </span>
          </div>
        </div>
        <button
          onClick={handleDisconnect}
          disabled={disconnecting}
          className="disconnect-btn"
        >
          {disconnecting ? 'Disconnecting...' : 'Disconnect'}
        </button>
      </div>

      {connection.error && (
        <div className="connection-error">
          <strong>Error:</strong> {connection.error}
        </div>
      )}

      {connection.authUrl && (
        <div className="auth-required">
          <p>
            <strong>Authentication Required</strong>
          </p>
          <a
            href={connection.authUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="auth-link"
          >
            Click here to authorize
          </a>
        </div>
      )}

      {connection.tools && connection.tools.length > 0 && (
        <div className="connection-tools">
          <h4>Available Tools ({connection.tools.length})</h4>
          <ToolList
            tools={connection.tools}
            sessionId={connection.sessionId}
            onCallTool={onCallTool}
          />
        </div>
      )}

      <div className="connection-details">
        <details>
          <summary>Connection Details</summary>
          <dl>
            <dt>Server URL:</dt>
            <dd>{connection.serverUrl}</dd>
            <dt>Session ID:</dt>
            <dd className="monospace">{connection.sessionId}</dd>
            <dt>State:</dt>
            <dd>{connection.state}</dd>
            {connection.lastActivity && (
              <>
                <dt>Last Activity:</dt>
                <dd>{new Date(connection.lastActivity).toLocaleString()}</dd>
              </>
            )}
          </dl>
        </details>
      </div>
    </div>
  );
}
