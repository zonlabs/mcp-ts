import { useEffect, useRef, useState } from 'react';
import type { SSEClient } from '../core/sse-client';
import { AppHost } from '../core/app-host';

/**
 * Hook to host an MCP App in a React component
 * 
 * @param client - Connected SSEClient instance
 * @param iframeRef - Reference to the iframe element
 * @param options - Optional configuration
 * @returns Object containing the AppHost instance (or null) and error state
 */
export function useMcpApp(
    client: SSEClient,
    iframeRef: React.RefObject<HTMLIFrameElement>,
    options?: {
        /** Callback when the App sends a message (e.g. to chat) */
        onMessage?: (params: { role: string; content: unknown }) => void;
    }
) {
    const [host, setHost] = useState<AppHost | null>(null);
    const [error, setError] = useState<Error | null>(null);

    // Store latest callback in ref to avoid re-initializing AppHost on callback change
    const onMessageRef = useRef(options?.onMessage);
    useEffect(() => {
        onMessageRef.current = options?.onMessage;
    }, [options?.onMessage]);

    useEffect(() => {
        if (!client || !iframeRef.current) return;

        try {
            // Initialize AppHost with security enforcement
            const appHost = new AppHost(client, iframeRef.current);

            // Register message handler
            appHost.onAppMessage = (params) => {
                onMessageRef.current?.(params);
            };

            appHost.start();
            setHost(appHost);
        } catch (err) {
            console.error('[useMcpApp] Failed to initialize AppHost:', err);
            setError(err instanceof Error ? err : new Error(String(err)));
        }

        // Cleanup usually not strictly necessary for AppBridge as it just hooks listeners,
        // but good practice if we add cleanup logic to AppHost later.
        return () => {
            setHost(null);
        };
    }, [client, iframeRef]);

    return { host, error };
}
