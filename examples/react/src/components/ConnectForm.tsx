import { useState } from 'react';
import type { FormEvent } from 'react';

interface ConnectFormProps {
  onConnect: (params: {
    serverId: string;
    serverName: string;
    serverUrl: string;
    callbackUrl: string;
    transportType?: 'sse' | 'streamable_http';
  }) => Promise<string>;
}

export default function ConnectForm({ onConnect, isConnected }: ConnectFormProps) {
  const [serverName, setServerName] = useState('My MCP Server');
  const [serverUrl, setServerUrl] = useState('https://mcp.example.com');
  const [callbackUrl, setCallbackUrl] = useState('http://localhost:3000/callback');
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setConnecting(true);
    setError(null);

    try {
      await onConnect({
        serverName,
        serverUrl,
        callbackUrl,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect');
    } finally {
      setConnecting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="connect-form">
      <div className="form-group">
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

      <div className="form-group">
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

      <div className="form-group">
        <label htmlFor="callbackUrl">OAuth Callback URL</label>
        <input
          id="callbackUrl"
          type="url"
          value={callbackUrl}
          onChange={(e) => setCallbackUrl(e.target.value)}
          placeholder="http://localhost:3000/callback"
          required
          disabled={connecting}
        />
      </div>

      {error && (
        <div className="error-message">
          {error}
        </div>
      )}

      <button type="submit" disabled={connecting || isConnected}>
        {connecting ? 'Connecting...' : isConnected ? 'Already Connected' : 'Connect'}
      </button>

      <p className="help-text">
        This will initiate an OAuth 2.0 flow to connect to the MCP server.
        Make sure your backend SSE endpoint is running.
      </p>
    </form>
  );
}
