"use client";

import { Suspense, useMemo } from "react";
import { useMcpAppIframe, type McpAppEvent } from "@mcp-ts/sdk/client/react";
import { useMcpContext } from "../mcp-provider";

interface McpAppToolProps {
    /** MCP app event from useMcpApps hook */
    app: McpAppEvent;
    /** Optional tool input override (defaults to app.input) */
    toolInput?: Record<string, unknown>;
    /** Optional tool result override (defaults to app.result) */
    toolResult?: unknown;
    /** Optional tool status override (defaults to app.status) */
    toolStatus?: "executing" | "inProgress" | "complete";
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
 * The actual iframe component - handles UI with business logic from hook
 */
function McpAppIframe({
    app,
    toolInput,
    toolResult,
    toolStatus,
}: McpAppToolProps) {
    const { client } = useMcpContext();
    const { iframeRef, isLaunched, error } = useMcpAppIframe({
        resourceUri: app.resourceUri,
        sessionId: app.sessionId!,
        toolInput: toolInput ?? app.input,
        toolResult: toolResult ?? app.result,
        toolStatus: toolStatus ?? app.status,
        client: client!,
    });

    if (error) {
        return <AppError message={error.message} />;
    }

    return (
        <div className="w-full border border-gray-700 rounded overflow-hidden bg-white min-h-96 my-2 relative">
            <iframe
                ref={iframeRef}
                sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups allow-downloads"
                className="w-full h-full min-h-96"
                style={{ height: 'auto' }}
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
 * Renders an MCP App UI in a sandboxed iframe with full control over styling.
 * Uses resource preloading for instant loading - the resource is fetched
 * when tools are discovered, not when the UI is rendered.
 *
 * @example
 * ```tsx
 * const { apps } = useMcpApps(agent, mcpClient);
 * const app = apps["my-tool"];
 *
 * {app && <McpAppTool app={app} />}
 * ```
 *
 * Pattern:
 * 1. Render iframe immediately (don't wait for resource)
 * 2. Launch in parallel (resource should be preloaded)
 * 3. Show loading state via overlay
 */
export function McpAppTool({ app, toolInput, toolResult, toolStatus }: McpAppToolProps) {
    // Memoize the key to prevent unnecessary re-renders
    const appKey = useMemo(
        () => `${app.sessionId}-${app.resourceUri}`,
        [app.sessionId, app.resourceUri]
    );

    return (
        <Suspense fallback={<AppLoadingSkeleton />}>
            <McpAppIframe
                key={appKey}
                app={app}
                toolInput={toolInput}
                toolResult={toolResult}
                toolStatus={toolStatus}
            />
        </Suspense>
    );
}
