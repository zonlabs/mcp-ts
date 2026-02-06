"use client";

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
 * MCP App Tool Component
 *
 * Renders an MCP App UI in a sandboxed iframe.
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
 */
export function McpAppTool({ app, toolInput, toolResult, toolStatus }: McpAppToolProps) {
    const { mcpClient } = useMcpContext();
    const { iframeRef, isLaunched, error } = useMcpAppIframe({
        resourceUri: app.resourceUri,
        sessionId: app.sessionId!,
        toolInput: toolInput ?? app.input,
        toolResult: toolResult ?? app.result,
        toolStatus: toolStatus ?? app.status,
        sseClient: mcpClient.sseClient!,
    });

    if (error) {
        return (
            <div className="p-4 bg-red-900/20 border border-red-700 rounded text-red-200">
                Error initializing MCP App: {error.message}
            </div>
        );
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
            {!isLaunched && (
                <div className="absolute inset-0 bg-gray-900/50 flex items-center justify-center pointer-events-none">
                    <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                </div>
            )}
        </div>
    );
}
