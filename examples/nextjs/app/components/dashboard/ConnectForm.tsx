import React, { useState } from 'react';
import styles from '../McpDashboard.module.css';
import { ConnectConfig } from './types';

interface ConnectFormProps {
    onConnect: (config: ConnectConfig) => Promise<void>;
    connecting: boolean;
    status: string;
    error: string | null;
}

export default function ConnectForm({ onConnect, connecting, status, error }: ConnectFormProps) {
    const [serverName, setServerName] = useState('');
    const [serverId, setServerId] = useState('');
    const [serverUrl, setServerUrl] = useState('');
    // Use popup-specific callback URL
    const [callbackUrl, setCallbackUrl] = useState(() => {
        if (typeof window !== 'undefined') {
            return `${window.location.origin}/oauth/callback-popup`;
        }
        return 'http://localhost:3000/oauth/callback-popup';
    });
    const [transportType, setTransportType] = useState<'sse' | 'streamable_http' | 'auto'>('auto');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        await onConnect({
            serverId,
            serverName,
            serverUrl,
            callbackUrl,
            transportType,
        });
    };

    return (
        <section className={styles.card}>
            <h2>Connect to MCP Server</h2>
            <form onSubmit={handleSubmit} className={styles.form}>
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
                        onChange={(e) => setTransportType(e.target.value as 'sse' | 'streamable_http' | 'auto')}
                        disabled={connecting}
                    >
                        <option value="auto">Auto</option>
                        <option value="streamable_http">Streamable HTTP (Recommended)</option>
                        <option value="sse">Server-Sent Events (SSE)</option>
                    </select>
                    <p className={styles.helpText}>
                        Use "Auto" to let the client negotiate the best transport.
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
    );
}
