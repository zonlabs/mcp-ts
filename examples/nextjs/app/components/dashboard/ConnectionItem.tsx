import React from 'react';
import styles from '../McpDashboard.module.css';
import { Connection } from './types';

interface ConnectionItemProps {
    connection: Connection;
    onDisconnect: (sessionId: string) => void;
    onSelectTool: (sessionId: string, toolName: string) => void;
}

export default function ConnectionItem({ connection, onDisconnect, onSelectTool }: ConnectionItemProps) {
    // Safely convert sessionId to string if it's not already
    const sessionIdStr = String(connection.sessionId);

    return (
        <div className={styles.connection}>
            <div className={styles.connectionHeader}>
                <div>
                    <h3>{connection.serverName}</h3>
                    <div className={styles.connectionMeta}>
                        <span className={styles.sessionId}>
                            Session: {sessionIdStr.slice(0, 8)}...
                        </span>
                        <span className={`${styles.stateBadge} ${styles[`state${connection.state}`]}`}>
                            {connection.state}
                        </span>
                    </div>
                </div>
                <button
                    onClick={() => onDisconnect(sessionIdStr)}
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
                <details className={styles.toolsDetails}>
                    <summary className={styles.toolsSummary}>Tools ({connection.tools.length})</summary>
                    <div className={styles.toolsContent}>
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
                                        onClick={() => onSelectTool(sessionIdStr, tool.name)}
                                        className={styles.executeBtn}
                                    >
                                        Execute
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </div>
                </details>
            )}

            <details className={styles.details}>
                <summary>Connection Details</summary>
                <dl>
                    <dt>Server ID:</dt>
                    <dd>{connection.serverId}</dd>
                    <dt>Server URL:</dt>
                    <dd>{connection.serverUrl}</dd>
                    <dt>Session ID:</dt>
                    <dd className={styles.monospace}>{sessionIdStr}</dd>
                    <dt>Transport:</dt>
                    <dd>{connection.transport || 'sse'}</dd>
                    <dt>State:</dt>
                    <dd>{connection.state}</dd>
                </dl>
            </details>
        </div>
    );
}
