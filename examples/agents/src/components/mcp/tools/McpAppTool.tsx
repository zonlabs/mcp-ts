"use client";

import { useEffect, useRef, useState, Suspense, useMemo } from "react";
import { useMcpApp } from "@mcp-ts/sdk/client/react";
import { useMcpContext } from "../mcp-provider";

interface McpAppToolProps {
    resourceUri: string;
    sessionId: string;
}

/**
 * Loading skeleton shown while the app is initializing
 */
function AppLoadingSkeleton() {
    return (
        <div className="w-full border border-gray-700 rounded overflow-hidden bg-gray-900 h-96 my-2 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-gray-400 text-sm">Loading app...</span>
            </div>
        </div>
    );
}

/**
 * Error display for failed app loading
 */
function AppError({ message }: { message: string }) {
    return (
        <div className="p-4 bg-red-900/20 border border-red-700 rounded text-red-200">
            Error initializing MCP App: {message}
        </div>
    );
}

/**
 * The actual iframe component that loads immediately
 * The iframe renders right away, and launch happens in parallel
 */
function McpAppIframe({
    resourceUri,
    sessionId,
    onError
}: McpAppToolProps & { onError: (err: Error) => void }) {
    const iframeRef = useRef<HTMLIFrameElement>(null!);
    const { client } = useMcpContext();
    const { host, error: hostError } = useMcpApp(client!, iframeRef);
    const [isLaunched, setIsLaunched] = useState(false);
    const launchAttemptedRef = useRef(false);

    // Report host initialization errors
    useEffect(() => {
        if (hostError) {
            onError(hostError);
        }
    }, [hostError, onError]);

    // Launch the app as soon as host is ready
    // The resource should already be preloaded, so this will be near-instant
    useEffect(() => {
        if (!host || !resourceUri || !sessionId || launchAttemptedRef.current) return;

        launchAttemptedRef.current = true;

        // Start launch immediately - don't await
        // The preloaded resource cache means this resolves almost instantly
        host.launch(resourceUri, sessionId)
            .then(() => {
                setIsLaunched(true);
            })
            .catch(err => {
                console.error("[McpAppTool] Launch failed:", err);
                onError(err instanceof Error ? err : new Error(String(err)));
            });
    }, [host, resourceUri, sessionId, onError]);

    return (
        <div className="w-full border border-gray-700 rounded overflow-hidden bg-white h-96 my-2 relative">
            <iframe
                ref={iframeRef}
                sandbox="allow-scripts allow-forms allow-modals allow-popups allow-downloads"
                className="w-full h-full"
                title="MCP App UI"
            />
            {/* Show subtle loading overlay until launched */}
            {!isLaunched && (
                <div className="absolute inset-0 bg-gray-900/50 flex items-center justify-center pointer-events-none">
                    <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                </div>
            )}
        </div>
    );
}

/**
 * MCP App Tool Component
 *
 * Renders an MCP App UI in a sandboxed iframe.
 * Uses resource preloading for instant loading - the resource is fetched
 * when tools are discovered, not when the UI is rendered.
 *
 * Pattern follows basic-host example:
 * 1. Render iframe immediately (don't wait for resource)
 * 2. Launch in parallel (resource should be preloaded)
 * 3. Show loading state via overlay, not by blocking render
 */
export function McpAppTool({ resourceUri, sessionId }: McpAppToolProps) {
    const [error, setError] = useState<Error | null>(null);

    // Memoize the key to prevent unnecessary re-renders
    const appKey = useMemo(
        () => `${sessionId}-${resourceUri}`,
        [sessionId, resourceUri]
    );

    if (error) {
        return <AppError message={error.message} />;
    }

    return (
        <Suspense fallback={<AppLoadingSkeleton />}>
            <McpAppIframe
                key={appKey}
                resourceUri={resourceUri}
                sessionId={sessionId}
                onError={setError}
            />
        </Suspense>
    );
}
