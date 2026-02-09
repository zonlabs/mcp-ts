/**
 * Simplified MCP Apps Hook - Fixed for no flickering
 *
 * The key insight: React component identity must be stable.
 * We return a stable McpAppRenderer component and separate metadata lookup.
 */

import React, { useState, useEffect, useCallback, useRef, memo } from 'react';
import { useAppHost } from './use-app-host.js';
import type { SSEClient } from '../core/sse-client.js';

export interface McpClient {
  connections: Array<{
    sessionId: string;
    tools: Array<{
      name: string;
      mcpApp?: {
        resourceUri: string;
      };
      _meta?: {
        ui?: {
          resourceUri?: string;
        };
        'ui/resourceUri'?: string;
      };
    }>;
  }>;
  sseClient?: SSEClient | null;
}

export interface McpAppMetadata {
  toolName: string;
  resourceUri: string;
  sessionId: string;
}

interface McpAppRendererProps {
  metadata: McpAppMetadata;
  input?: Record<string, unknown>;
  result?: unknown;
  status: 'executing' | 'inProgress' | 'complete' | 'idle';
  sseClient?: SSEClient | null;
  /** Custom CSS class for the container */
  className?: string;
}

/**
 * Stable renderer component - memoized to prevent flickering
 * Uses refs to track data changes and send updates to the iframe
 */
const McpAppRenderer = memo(function McpAppRenderer({
  metadata,
  input,
  result,
  status,
  sseClient,
  className,
}: McpAppRendererProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const { host, error: hostError } = useAppHost(sseClient as SSEClient, iframeRef);
  const [isLaunched, setIsLaunched] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Track which data has been sent to prevent duplicates
  const sentInputRef = useRef(false);
  const sentResultRef = useRef(false);
  const lastInputRef = useRef(input);
  const lastResultRef = useRef(result);
  const lastStatusRef = useRef(status);

  // Launch the app when host is ready
  useEffect(() => {
    if (!host || !metadata.resourceUri || !metadata.sessionId) return;

    host
      .launch(metadata.resourceUri, metadata.sessionId)
      .then(() => setIsLaunched(true))
      .catch((err) => setError(err instanceof Error ? err : new Error(String(err))));
  }, [host, metadata.resourceUri, metadata.sessionId]);

  // Send tool input when available or when it changes
  useEffect(() => {
    if (!host || !isLaunched || !input) return;
    
    // Send if never sent, or if input changed
    if (!sentInputRef.current || JSON.stringify(input) !== JSON.stringify(lastInputRef.current)) {
      sentInputRef.current = true;
      lastInputRef.current = input;
      host.sendToolInput(input);
    }
  }, [host, isLaunched, input]);

  // Send tool result when complete or when it changes
  useEffect(() => {
    if (!host || !isLaunched || result === undefined) return;
    if (status !== 'complete') return;

    // Send if never sent, or if result changed
    if (!sentResultRef.current || JSON.stringify(result) !== JSON.stringify(lastResultRef.current)) {
      sentResultRef.current = true;
      lastResultRef.current = result;
      const formattedResult =
        typeof result === 'string'
          ? { content: [{ type: 'text', text: result }] }
          : result;
      host.sendToolResult(formattedResult);
    }
  }, [host, isLaunched, result, status]);

  // Reset sent flags when tool status resets to executing (new tool call)
  useEffect(() => {
    if (status === 'executing' && lastStatusRef.current !== 'executing') {
      sentInputRef.current = false;
      sentResultRef.current = false;
    }
    lastStatusRef.current = status;
  }, [status]);

  // Display errors
  const displayError = error || hostError;
  if (displayError) {
    return (
      <div className={`p-4 bg-red-900/20 border border-red-700 rounded text-red-200 ${className || ''}`}>
        Error: {displayError.message || String(displayError)}
      </div>
    );
  }

  return (
    <div className={`w-full border border-gray-700 rounded overflow-hidden bg-white min-h-96 my-2 relative ${className || ''}`}>
      <iframe
        ref={iframeRef}
        sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups allow-downloads"
        className="w-full h-full min-h-96"
        style={{ height: 'auto' }}
        title="MCP App"
      />
      {!isLaunched && (
        <div className="absolute inset-0 bg-gray-900/50 flex items-center justify-center pointer-events-none">
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
});

/**
 * Simple hook to get MCP app metadata
 *
 * @param mcpClient - The MCP client from useMcp() or context
 * @returns Object with getAppMetadata function and McpAppRenderer component
 *
 * @example
 * ```tsx
 * function ToolRenderer(props) {
 *   const { getAppMetadata, McpAppRenderer } = useMcpApps(mcpClient);
 *   const metadata = getAppMetadata(props.name);
 *
 *   if (!metadata) return null;
 *   return (
 *     <McpAppRenderer
 *       metadata={metadata}
 *       input={props.args}
 *       result={props.result}
 *       status={props.status}
 *     />
 *   );
 * }
 * ```
 */
export function useMcpApps(mcpClient: McpClient | null) {
  /**
   * Get MCP app metadata for a tool name
   * This is fast and can be called on every render
   */
  const getAppMetadata = useCallback(
    (toolName: string): McpAppMetadata | undefined => {
      if (!mcpClient) return undefined;

      const extractedName = extractToolName(toolName);

      for (const conn of mcpClient.connections) {
        for (const tool of conn.tools) {
          const candidateName = extractToolName(tool.name);
          // Check both locations: direct mcpApp or _meta.ui
          const resourceUri =
            tool.mcpApp?.resourceUri ??
            tool._meta?.ui?.resourceUri ??
            tool._meta?.['ui/resourceUri'];

          if (resourceUri && candidateName === extractedName) {
            return {
              toolName: candidateName,
              resourceUri,
              sessionId: conn.sessionId,
            };
          }
        }
      }

      return undefined;
    },
    [mcpClient]
  );

  return { getAppMetadata, McpAppRenderer };
}

/**
 * Extract the base tool name, removing any prefixes
 */
function extractToolName(fullName: string): string {
  // Handle patterns like "tool_abc123_get-time" -> "get-time"
  const match = fullName.match(/(?:tool_[^_]+_)?(.+)$/);
  return match?.[1] || fullName;
}
