import React from 'react';
import styles from '../McpDashboard.module.css';
import ConnectionItem from './ConnectionItem';
import { Connection } from './types';

interface ConnectionListProps {
    connections: Connection[];
    isInitializing: boolean;
    onDisconnect: (sessionId: string) => void;
    onSelectTool: (sessionId: string, toolName: string) => void;
}

export default function ConnectionList({
    connections,
    isInitializing,
    onDisconnect,
    onSelectTool
}: ConnectionListProps) {
    return (
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
                <ConnectionItem
                    key={connection.sessionId}
                    connection={connection}
                    onDisconnect={onDisconnect}
                    onSelectTool={onSelectTool}
                />
            ))}
        </section>
    );
}
