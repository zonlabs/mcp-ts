import React from 'react';
import styles from '../McpDashboard.module.css';

interface McpHeaderProps {
    status: string;
}

export default function McpHeader({ status }: McpHeaderProps) {
    return (
        <header className={styles.header}>
            <h1>MCP Redis - Next.js Example</h1>
            <div className={styles.statusBadge} data-status={status}>
                SSE Status: {status}
            </div>
        </header>
    );
}
