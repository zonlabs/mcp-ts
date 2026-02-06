"use client";

import { createContext, useContext, ReactNode, useCallback } from 'react';
import { useMcp, type McpClient } from '@mcp-ts/sdk/client/react';

interface McpContextValue {
    mcpClient: McpClient;
}

const McpContext = createContext<McpContextValue | null>(null);

interface McpProviderProps {
    children: ReactNode;
    url: string;
    identity: string;
    requestTimeout?: number;
}

/**
 * MCP Provider - Shares a single MCP client instance across the app
 * Prevents duplicate SSE connections and request timeouts
 */
export function McpProvider({ children, url, identity, requestTimeout }: McpProviderProps) {
    // Open OAuth URL in a centered popup window
    const handleOAuthRedirect = useCallback((authUrl: string) => {
        const width = 600;
        const height = 700;
        const left = window.screenX + (window.outerWidth - width) / 2;
        const top = window.screenY + (window.outerHeight - height) / 2;

        const popup = window.open(
            authUrl,
            'mcp-oauth-popup',
            `width=${width},height=${height},left=${left},top=${top},popup=yes`
        );

        if (!popup) {
            // Fallback to redirect if popup is blocked
            console.warn('Popup blocked, falling back to redirect');
            window.location.href = authUrl;
        }
    }, []);

    const mcpClient = useMcp({
        url,
        identity,
        requestTimeout,
        onRedirect: handleOAuthRedirect,
    });

    return (
        <McpContext.Provider value={{ mcpClient }}>
            {children}
        </McpContext.Provider>
    );
}

/**
 * Hook to access the shared MCP client
 * Must be used within McpProvider
 */
export function useMcpContext(): McpContextValue {
    const context = useContext(McpContext);
    if (!context) {
        throw new Error('useMcpContext must be used within McpProvider');
    }
    return context;
}
