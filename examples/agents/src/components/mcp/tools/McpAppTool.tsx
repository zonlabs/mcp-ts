"use client";

import { useEffect, useRef, useState } from "react";
import { useMcpApp } from "@mcp-ts/sdk/client/react";
import { useMcpContext } from "../mcp-provider";

interface McpAppToolProps {
    resourceUri: string;
    sessionId: string;
}

export function McpAppTool({ resourceUri, sessionId }: McpAppToolProps) {
    const iframeRef = useRef<HTMLIFrameElement>(null!);
    const { client } = useMcpContext();
    const { host, error } = useMcpApp(client!, iframeRef);
    const [isReady, setIsReady] = useState(false);

    useEffect(() => {
        if (host && resourceUri && sessionId) {
            console.log("[McpAppTool] Launching app:", resourceUri);
            host.launch(resourceUri, sessionId)
                .then(() => setIsReady(true))
                .catch(err => console.error("[McpAppTool] Launch failed:", err));
        }
    }, [host, resourceUri, sessionId]);

    if (error) {
        return (
            <div className="p-4 bg-red-900/20 border border-red-700 rounded text-red-200">
                Error initializing MCP App: {error.message}
            </div>
        );
    }

    return (
        <div className="w-full border border-gray-700 rounded overflow-hidden bg-white h-96 my-2">
            <iframe
                ref={iframeRef}
                sandbox="allow-scripts allow-forms allow-modals allow-popups allow-downloads"
                className="w-full h-full"
                title="MCP App UI"
            />
        </div>
    );
}
