/**
 * useMcpAppIframe Hook
 * Manages iframe lifecycle, app host communication, and tool data flow
 */

import { useEffect, useRef, useState } from 'react';
import type { SSEClient } from '../core/sse-client.js';
import { useAppHost } from './use-app-host.js';

export interface McpAppIframeProps {
  /**
   * The resource URI of the MCP app to load
   */
  resourceUri: string;

  /**
   * The session ID for the MCP connection
   */
  sessionId: string;

  /**
   * Tool input arguments to send to the app
   */
  toolInput?: Record<string, unknown>;

  /**
   * Tool execution result to send to the app
   */
  toolResult?: unknown;

  /**
   * Current status of the tool execution
   */
  toolStatus?: 'executing' | 'inProgress' | 'complete';

  /**
   * SSE client instance for MCP operations
   */
  sseClient: SSEClient;
}

interface McpAppIframeResult {
  /**
   * Ref to attach to the iframe element
   */
  iframeRef: React.RefObject<HTMLIFrameElement>;

  /**
   * Whether the app has been successfully launched
   */
  isLaunched: boolean;

  /**
   * Error that occurred during initialization or execution
   */
  error: Error | null;
}

/**
 * Hook to manage MCP app iframe lifecycle and communication
 *
 * Handles:
 * - Iframe setup and host initialization
 * - App launching with resource preloading
 * - Tool input and result communication
 * - Error tracking
 *
 * Returns refs and state for UI rendering - styling is left to the user.
 *
 * @param props - Configuration for the iframe
 * @returns Iframe ref, launch state, and error state
 *
 * @example
 * const { iframeRef, isLaunched, error } = useMcpAppIframe({
 *   resourceUri: "https://example.com/app",
 *   sessionId: "session-123",
 *   toolInput: myInput,
 *   toolResult: myResult,
 *   toolStatus: "complete",
 *   sseClient: sseClient,
 * });
 *
 * return (
 *   <div className="my-custom-container">
 *     <iframe ref={iframeRef} className="my-iframe-style" />
 *     {!isLaunched && <p>Loading...</p>}
 *     {error && <p>Error: {error.message}</p>}
 *   </div>
 * );
 */
export function useMcpAppIframe({
  resourceUri,
  sessionId,
  toolInput,
  toolResult,
  toolStatus,
  sseClient,
}: McpAppIframeProps): McpAppIframeResult {
  const iframeRef = useRef<HTMLIFrameElement>(null!);
  const { host, error: hostError } = useAppHost(sseClient, iframeRef);

  const [isLaunched, setIsLaunched] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Track attempt flags to ensure operations run only once
  const launchAttemptedRef = useRef(false);
  const toolInputSentRef = useRef(false);
  const toolResultSentRef = useRef(false);

  // Report host initialization errors
  useEffect(() => {
    if (hostError) {
      setError(hostError);
    }
  }, [hostError]);

  // Launch the app when host is ready
  // The resource should be preloaded, so this resolves instantly
  useEffect(() => {
    if (!host || !resourceUri || !sessionId || launchAttemptedRef.current) return;

    launchAttemptedRef.current = true;

    host
      .launch(resourceUri, sessionId)
      .then(() => {
        setIsLaunched(true);
      })
      .catch((err) => {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
      });
  }, [host, resourceUri, sessionId]);

  // Send tool input to the app when available and launched
  useEffect(() => {
    if (!host || !isLaunched || !toolInput || toolInputSentRef.current) return;

    toolInputSentRef.current = true;
    host.sendToolInput(toolInput);
  }, [host, isLaunched, toolInput]);

  // Send tool result to the app when available and complete
  useEffect(() => {
    if (!host || !isLaunched || toolResult === undefined || toolResultSentRef.current) return;
    if (toolStatus !== 'complete') return;

    toolResultSentRef.current = true;

    // Format result - wrap string results in content array for MCP compatibility
    const formattedResult =
      typeof toolResult === 'string'
        ? { content: [{ type: 'text', text: toolResult }] }
        : toolResult;

    host.sendToolResult(formattedResult);
  }, [host, isLaunched, toolResult, toolStatus]);

  return {
    iframeRef,
    isLaunched,
    error,
  };
}
