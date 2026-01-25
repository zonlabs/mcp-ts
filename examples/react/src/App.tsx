import { useState } from 'react';
import { useMcp } from '@mcp-ts/redis/client';
import ConnectionList from './components/ConnectionList';
import ConnectForm from './components/ConnectForm';
import './App.css';

function App() {
  const [sseUrl] = useState('https://mcp.deepwiki.com/mcp');
  const [identity] = useState('test-user'); // In production, get from your auth system
  const [authToken] = useState(''); // In production, get from your auth system

  const {
    connections,
    status,
    connect,
    disconnect,
  } = useMcp({
    url: sseUrl,
    identity,
    authToken,
    autoConnect: true,
  });

  return (
    <div className="app">
      <header>
        <h1>MCP Redis Client Example</h1>
        <div className="status-badge" data-status={status}>
          SSE Status: {status}
        </div>
      </header>

      <main>
        <section className="connect-section">
          <h2>Connect to MCP Server</h2>
          <ConnectForm
            onConnect={connect}
          />
        </section>

        <section className="connections-section">
          <h2>Active Connections ({connections.length})</h2>
          <ConnectionList
            connections={connections}
            onDisconnect={disconnect}
          />
        </section>

        <section className="info-section">
          <h3>About this Example</h3>
          <p>
            This example demonstrates the <code>useMcp</code> hook from{' '}
            <code>@mcp-ts/redis</code>. It connects to an MCP server
            via Server-Sent Events (SSE) with Redis-backed session management.
          </p>
          <h4>Features:</h4>
          <ul>
            <li>Real-time connection status via SSE</li>
            <li>OAuth 2.1 authentication flow</li>
            <li>Tool discovery and execution</li>
            <li>Automatic reconnection handling</li>
            <li>Redis-backed session persistence</li>
          </ul>
          <h4>Setup Required:</h4>
          <ol>
            <li>Set up a backend SSE endpoint (see server examples)</li>
            <li>Configure Redis connection</li>
            <li>Update the SSE URL above to match your backend</li>
          </ol>
        </section>
      </main>
    </div>
  );
}

export default App;
