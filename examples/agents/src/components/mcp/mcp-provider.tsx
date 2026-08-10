"use client";

import { createContext, useContext, ReactNode, useMemo } from 'react';
import { createOAuthPopupRedirectHandler, useMcp, type McpClient } from '@mcp-ts/sdk/client/react';

interface McpContextValue {
    mcpClient: McpClient;
}

const McpContext = createContext<McpContextValue | null>(null);

interface McpProviderProps {
    children: ReactNode;
    url: string;
    userId: string;
    requestTimeout?: number;
}

/**
 * MCP Provider - Shares a single MCP client instance across the app
 * Prevents duplicate SSE connections and request timeouts
 */
export function McpProvider({ children, url, userId, requestTimeout }: McpProviderProps) {
    const handleOAuthRedirect = useMemo(() => createOAuthPopupRedirectHandler({
        onBlocked: (authUrl: string) => {
            console.warn('Popup blocked, falling back to redirect');
            window.location.href = authUrl;
        },
    }), []);

    const mcpClient = useMcp({
        url,
        userId,
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
