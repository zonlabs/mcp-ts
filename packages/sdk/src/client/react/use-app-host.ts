import { useEffect, useRef, useState, useCallback } from 'react';
import type { AppHostClient } from '../core/types';
import { AppHost, type AppHostOptions } from '../core/app-host';

/**
 * Hook to host an MCP App in a React component
 *
 * Initialization is async but optimized for instant availability:
 * - Constructor runs synchronously (sandbox + bridge handler setup)
 * - Host is set in state immediately so launch() can be called right away
 * - start() is a lightweight no-op reserved for future async pre-init work
 * - The real async work (iframe load, bridge connect) happens inside launch()
 *
 * @param client - Connected SSEClient instance
 * @param iframeRef - Reference to the iframe element
 * @param options - Optional configuration
 * @returns Object containing the AppHost instance (or null) and error state
 */
export type UseAppHostOptions = AppHostOptions;

export function useAppHost(
    client: AppHostClient | null,
    iframeRef: React.RefObject<HTMLIFrameElement>,
    options?: UseAppHostOptions
) {
    const [host, setHost] = useState<AppHost | null>(null);
    const [error, setError] = useState<Error | null>(null);
    const initializingRef = useRef(false);

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
                // Initialize AppHost with security enforcement and options
                const appHost = new AppHost(client, iframeRef.current!, options);

                // Set host immediately so launch can be called
                // (launch will wait for bridge if needed)
                setHost(appHost);

                // Start bridge connection (this is fast, just sets up PostMessage)
                await appHost.start();
            } catch (err) {
                console.error('[useAppHost] Failed to initialize AppHost:', err);
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
