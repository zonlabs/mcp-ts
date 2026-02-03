import { useEffect, useRef, useState, useCallback } from 'react';
import type { SSEClient } from '../core/sse-client';
import { AppHost } from '../core/app-host';

/**
 * Hook to host an MCP App in a React component
 *
 * Optimized for instant loading:
 * - Creates AppHost synchronously
 * - Starts bridge connection immediately
 * - Returns host before connection completes (ready to call launch)
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
    const initializingRef = useRef(false);

    // Store latest callback in ref to avoid re-initializing AppHost on callback change
    const onMessageRef = useRef(options?.onMessage);
    useEffect(() => {
        onMessageRef.current = options?.onMessage;
    }, [options?.onMessage]);

    useEffect(() => {
        if (!client || !iframeRef.current || initializingRef.current) return;

        // Prevent double initialization in strict mode
        initializingRef.current = true;

        const initHost = async () => {
            try {
                // Initialize AppHost with security enforcement
                const appHost = new AppHost(client, iframeRef.current!);

                // Register message handler
                appHost.onAppMessage = (params) => {
                    onMessageRef.current?.(params);
                };

                // Set host immediately so launch can be called
                // (launch will wait for bridge if needed)
                setHost(appHost);

                // Start bridge connection (this is fast, just sets up PostMessage)
                await appHost.start();
            } catch (err) {
                console.error('[useMcpApp] Failed to initialize AppHost:', err);
                setError(err instanceof Error ? err : new Error(String(err)));
            }
        };

        initHost();

        return () => {
            initializingRef.current = false;
            setHost(null);
        };
    }, [client, iframeRef]);

    return { host, error };
}
