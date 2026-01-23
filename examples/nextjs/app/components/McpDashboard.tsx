'use client';

import { useState } from 'react';
import { useMcp } from '@mcp-assistant/mcp-redis/client';
import styles from './McpDashboard.module.css';

export default function McpDashboard() {
  const [userId] = useState('demo-user-123');
  const [authToken] = useState('demo-auth-token');

  const {
    connections,
    status,
    isInitializing,
    connect,
    disconnect,
    callTool,
    listTools,
  } = useMcp({
    url: '/api/mcp',
    userId,
    authToken,
    autoConnect: true,
    autoInitialize: true, // Auto-load sessions on mount
    onLog: (level, message, metadata) => {
      console.log(`[${level}] ${message}`, metadata);
    },
  });

  const [serverName, setServerName] = useState('');
  const [serverId, setServerId] = useState('');
  const [serverUrl, setServerUrl] = useState('');
  const [callbackUrl, setCallbackUrl] = useState('http://localhost:3000/oauth/callback');
  const [transportType, setTransportType] = useState<'sse' | 'streamable_http'>('streamable_http');
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Tool execution state
  const [selectedTool, setSelectedTool] = useState<{
    sessionId: string;
    toolName: string;
  } | null>(null);
  const [toolArgs, setToolArgs] = useState('{}');
  const [toolResult, setToolResult] = useState<any>(null);
  const [isExecuting, setIsExecuting] = useState(false);

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setConnecting(true);
    setError(null);

    try {
      await connect({
        serverId,
        serverName,
        serverUrl,
        callbackUrl,
        transportType,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect');
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

  const handleExecuteTool = async () => {
    if (!selectedTool) return;

    setIsExecuting(true);
    setToolResult(null);

    try {
      // Parse args from JSON input
      const args = JSON.parse(toolArgs);
      const result = await callTool(selectedTool.sessionId, selectedTool.toolName, args);
      setToolResult(result);
    } catch (err) {
      setToolResult({
        error: err instanceof Error ? err.message : 'Tool execution failed'
      });
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1>MCP Redis - Next.js Example</h1>
        <div className={styles.statusBadge} data-status={status}>
          SSE Status: {status}
        </div>
      </header>

      <div className={styles.grid}>
        {/* Connect Form */}
        <section className={styles.card}>
          <h2>Connect to MCP Server</h2>
          <form onSubmit={handleConnect} className={styles.form}>
            <div className={styles.formGroup}>
              <label htmlFor="serverId">Server ID</label>
              <input
                id="serverId"
                type="text"
                value={serverId}
                onChange={(e) => setServerId(e.target.value)}
                placeholder="server-001"
                required
                disabled={connecting}
              />
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="serverName">Server Name</label>
              <input
                id="serverName"
                type="text"
                value={serverName}
                onChange={(e) => setServerName(e.target.value)}
                placeholder="My MCP Server"
                required
                disabled={connecting}
              />
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="serverUrl">Server URL</label>
              <input
                id="serverUrl"
                type="url"
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
                placeholder="https://mcp.example.com"
                required
                disabled={connecting}
              />
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="callbackUrl">OAuth Callback URL</label>
              <input
                id="callbackUrl"
                type="url"
                value={callbackUrl}
                onChange={(e) => setCallbackUrl(e.target.value)}
                placeholder="http://localhost:3000/oauth/callback"
                required
                disabled={connecting}
              />
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="transportType">Transport Type</label>
              <select
                id="transportType"
                value={transportType}
                onChange={(e) => setTransportType(e.target.value as 'sse' | 'streamable_http')}
                disabled={connecting}
              >
                <option value="streamable_http">Streamable HTTP (Recommended)</option>
                <option value="sse">Server-Sent Events (SSE)</option>
              </select>
              <p className={styles.helpText}>
                Most MCP servers support Streamable HTTP. Use SSE if your server specifically requires it.
              </p>
            </div>

            {error && (
              <div className={styles.error}>
                {error}
              </div>
            )}

            <button type="submit" disabled={connecting || status !== 'connected'} className={styles.button}>
              {connecting ? 'Connecting...' : 'Connect'}
            </button>

            {status !== 'connected' && (
              <p className={styles.helpText}>
                Waiting for SSE connection...
              </p>
            )}
          </form>
        </section>

        {/* Connections List */}
        <section className={styles.card}>
          <h2>Active Connections ({connections.length})</h2>

          {isInitializing && (
            <p className={styles.loading}>Loading sessions...</p>
          )}

          {!isInitializing && connections.length === 0 && (
            <p className={styles.emptyState}>
              No active connections. Connect to an MCP server to get started.
            </p>
          )}

          {connections.map((connection) => (
            <div key={connection.sessionId} className={styles.connection}>
              <div className={styles.connectionHeader}>
                <div>
                  <h3>{connection.serverName}</h3>
                  <div className={styles.connectionMeta}>
                    <span className={styles.sessionId}>
                      Session: {connection.sessionId.slice(0, 8)}...
                    </span>
                    <span className={`${styles.stateBadge} ${styles[`state${connection.state}`]}`}>
                      {connection.state}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => handleDisconnect(connection.sessionId)}
                  className={styles.disconnectBtn}
                >
                  Disconnect
                </button>
              </div>

              {connection.error && (
                <div className={styles.connectionError}>
                  <strong>Error:</strong> {connection.error}
                </div>
              )}

              {connection.tools && connection.tools.length > 0 && (
                <div className={styles.tools}>
                  <h4>Tools ({connection.tools.length})</h4>
                  <ul>
                    {connection.tools.map((tool) => (
                      <li key={tool.name}>
                        <div className={styles.toolInfo}>
                          <code>{tool.name}</code>
                          {tool.description && (
                            <span className={styles.toolDescription}>
                              {tool.description}
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() => {
                            setSelectedTool({
                              sessionId: connection.sessionId,
                              toolName: tool.name,
                            });
                            setToolArgs('{}');
                            setToolResult(null);
                          }}
                          className={styles.executeBtn}
                        >
                          Execute
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <details className={styles.details}>
                <summary>Connection Details</summary>
                <dl>
                  <dt>Server ID:</dt>
                  <dd>{connection.serverId}</dd>
                  <dt>Server URL:</dt>
                  <dd>{connection.serverUrl}</dd>
                  <dt>Session ID:</dt>
                  <dd className={styles.monospace}>{connection.sessionId}</dd>
                  <dt>Transport:</dt>
                  <dd>{connection.transport || 'sse'}</dd>
                  <dt>State:</dt>
                  <dd>{connection.state}</dd>
                </dl>
              </details>
            </div>
          ))}
        </section>

        {/* Info Section */}
        <section className={`${styles.card} ${styles.infoCard}`}>
          <h2>About This Example</h2>
          <p>
            This example demonstrates how to use <code>@mcp-assistant/mcp-redis</code> in a Next.js application.
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

      {/* Tool Execution Panel */}
      {selectedTool && (
        <div className={styles.modal}>
          <h3>Execute Tool: {selectedTool.toolName}</h3>

          <div className={styles.modalContent}>
            <label className={styles.modalLabel}>
              Tool Arguments (JSON):
            </label>
            <textarea
              value={toolArgs}
              onChange={(e) => setToolArgs(e.target.value)}
              placeholder='{"arg1": "value1", "arg2": "value2"}'
              className={styles.modalTextarea}
            />
          </div>

          {toolResult && (
            <div className={`${styles.modalResult} ${toolResult.error ? styles.error : styles.success}`}>
              <h4>Result:</h4>
              <pre>{JSON.stringify(toolResult, null, 2)}</pre>
            </div>
          )}

          <div className={styles.modalActions}>
            <button
              onClick={() => setSelectedTool(null)}
              className={styles.buttonSecondary}
            >
              Close
            </button>
            <button
              onClick={handleExecuteTool}
              disabled={isExecuting}
              className={styles.button}
            >
              {isExecuting ? 'Executing...' : 'Run Tool'}
            </button>
          </div>
        </div>
      )}

      {/* Overlay */}
      {selectedTool && (
        <div
          onClick={() => setSelectedTool(null)}
          className={styles.overlay}
        />
      )}
    </div>
  );
}
