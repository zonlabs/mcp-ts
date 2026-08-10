/**
 * MCP Apps Hook
 *
 * Provides utilities for rendering interactive UI components from MCP servers.
 */

import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  memo,
  useMemo,
  forwardRef,
  useImperativeHandle,
  type MutableRefObject,
} from 'react';
import type { UseAppHostOptions } from './use-app-host.js';
import { useAppHost } from './use-app-host.js';
import { resolveMetaToolProxy } from '../../shared/meta-tools.js';
import type { SSEClient } from '../core/sse-client.js';
import { APP_HOST_DEFAULTS } from '../core/constants.js';
import type { SandboxConfig } from '../core/app-host.js';

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

/**
 * Imperative handle for {@link useMcpApps}'s `McpAppRenderer` (via `ref`),
 * aligned with `@mcp-ui/client`'s `AppRendererHandle.teardownResource`.
 */
export interface McpAppRendererHandle {
  teardownResource: (params?: Record<string, unknown>) => void;
}

/** Props for {@link useMcpApps}'s `McpAppRenderer` (client is supplied via the hook). */
export interface McpAppRendererProps extends Pick<UseAppHostOptions, 'sandbox' | 'hostContext' | 'onCallTool' | 'onReadResource' | 'onFallbackRequest' | 'onMessage' | 'onOpenLink' | 'onLoggingMessage' | 'onSizeChanged' | 'onError'> {
  name: string;
  client?: McpClient | null;
  toolResourceUri?: string;
  html?: string;
  input?: Record<string, unknown> | null;
  result?: unknown;
  status?: 'executing' | 'inProgress' | 'complete' | 'idle';
  toolInputPartial?: any;
  toolCancelled?: boolean;
  className?: string;
  loader?: React.ReactNode;
}

type McpAppViewProps = McpAppRendererProps & {
  /**
   * Ref avoids tying `McpAppRenderer` userId to `mcpClient`: when `connections` updates, `useMcp()` still
   * returns a new object (correct for `useEffect` deps), but the iframe must not remount.
   */
  clientRef: MutableRefObject<McpClient | null>;
};

/** Renders one MCP App in a sandboxed iframe; reads the latest client from `clientRef` each render. */
const McpAppViewInner = forwardRef<McpAppRendererHandle, McpAppViewProps>(function McpAppView(
  {
    clientRef,
    name,
    toolResourceUri,
    html,
    input,
    result,
    status = 'idle',
    toolInputPartial,
    toolCancelled,
    sandbox,
    hostContext,
    onCallTool,
    onReadResource,
    onFallbackRequest,
    onMessage,
    onOpenLink,
    onLoggingMessage,
    onSizeChanged,
    onError: onHostError,
    className,
    loader,
  },
  ref,
) {
  
  const mcpClient = clientRef.current;
  const { toolName: resolvedToolName, args: resolvedInput } = resolveMetaToolProxy(name, input);
  const metadata = getMcpAppMetadata(mcpClient, resolvedToolName, resolvedInput);
  const sseClient = mcpClient?.sseClient ?? null;
  const resourceUri = toolResourceUri || metadata?.resourceUri;
  const appSessionId = metadata?.sessionId;

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // Tracks the last height (px) reported by the guest before/after fullscreen so we
  // can restore it when the native fullscreen API exits and the guest fires a stale
  // resize event that would otherwise collapse the iframe to 0.
  const preFullscreenHeightRef = useRef<number | null>(null);
  const displayModeRef = useRef<'inline' | 'fullscreen'>('inline');
  const [displayMode, setDisplayMode] = useState<'inline' | 'fullscreen'>('inline');

  const setDisplayModeWithRef = (mode: 'inline' | 'fullscreen') => {
    displayModeRef.current = mode;
    setDisplayMode(mode);
  };

  const { host, error: hostError } = useAppHost(sseClient as any, iframeRef, {
    sandbox,
    hostContext,
    onCallTool,
    onReadResource,
    onFallbackRequest,
    onMessage,
    onOpenLink,
    onLoggingMessage,
    // Intercept onSizeChanged: when exiting fullscreen, ignore guest resize events
    // that arrive with the shrunken viewport dimensions, and restore the pre-fullscreen height.
    onSizeChanged: (params) => {
      if (displayModeRef.current === 'inline' && preFullscreenHeightRef.current !== null) {
        // Guest fired a resize right after fullscreen exit – restore the saved height
        const savedHeight = preFullscreenHeightRef.current;
        preFullscreenHeightRef.current = null;
        if (iframeRef.current) {
          iframeRef.current.style.height = `${savedHeight}px`;
        }
        return;
      }
      onSizeChanged?.(params);
    },
    onError: onHostError,
    onRequestDisplayMode: async (params) => {
      if (params.mode === 'fullscreen') {
        // Snapshot current iframe height so we can restore on exit
        if (iframeRef.current) {
          const h = iframeRef.current.getBoundingClientRect().height;
          if (h > 0) preFullscreenHeightRef.current = h;
        }
        try {
          if (containerRef.current?.requestFullscreen) {
            await containerRef.current.requestFullscreen();
          } else if ((containerRef.current as any)?.webkitRequestFullscreen) {
            await (containerRef.current as any).webkitRequestFullscreen();
          }
          setDisplayModeWithRef('fullscreen');
        } catch (err) {
          console.warn('[McpAppHost] requestFullscreen failed:', err);
          preFullscreenHeightRef.current = null;
          return { mode: 'inline' };
        }
      } else if (params.mode === 'inline') {
        // Eagerly restore height — don't wait for a guest onsizechange that may never arrive
        restoreHeightAfterFullscreen();
        try {
          if (document.fullscreenElement) {
            await document.exitFullscreen();
          }
        } catch (err) {}
        setDisplayModeWithRef('inline');
      }
      return { mode: params.mode };
    }
  });

  useImperativeHandle(
    ref,
    () => ({
      teardownResource: (params?: Record<string, unknown>) => {
        host?.teardownResource(params ?? {});
      },
    }),
    [host],
  );

  const [isLaunched, setIsLaunched] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const sentInputRef = useRef(false);
  const sentResultRef = useRef(false);
  const lastInputRef = useRef(resolvedInput);
  const lastResultRef = useRef(result);
  const lastStatusRef = useRef(status);

  useEffect(() => {
    setIsLaunched(false);
    setError(null);
  }, [resourceUri, appSessionId]);

  // Eagerly restore the iframe's pre-fullscreen height at every exit point.
  // The guest app may NOT fire onSizeChanged after exiting fullscreen, so we cannot
  // rely on the onSizeChanged interceptor to restore the height.
  const restoreHeightAfterFullscreen = () => {
    const savedHeight = preFullscreenHeightRef.current;
    if (savedHeight && iframeRef.current) {
      iframeRef.current.style.height = `${savedHeight}px`;
    }
    preFullscreenHeightRef.current = null;
  };

  useEffect(() => {
    const onFullscreenChange = () => {
      const isFullscreen = !!document.fullscreenElement;
      // Use ref to avoid stale closure (ESC key exit path)
      if (!isFullscreen && displayModeRef.current === 'fullscreen') {
        restoreHeightAfterFullscreen();
        setDisplayModeWithRef('inline');
      }
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []); // stable – reads from refs only, no stale closure over state

  useEffect(() => {
    if (!host || (!resourceUri && !html)) return;

    host
      .launch({ uri: resourceUri, html }, appSessionId)
      .then(() => setIsLaunched(true))
      .catch((err) => setError(err instanceof Error ? err : new Error(String(err))));
  }, [host, resourceUri, html, appSessionId]);

  // Send tool inputs
  useEffect(() => {
    if (!host || !isLaunched || !resourceUri || !appSessionId || !resolvedInput) return;

    if (!sentInputRef.current || JSON.stringify(resolvedInput) !== JSON.stringify(lastInputRef.current)) {
      sentInputRef.current = true;
      lastInputRef.current = resolvedInput;
      host.sendToolInput(resolvedInput);
    }
  }, [host, isLaunched, resolvedInput, resourceUri, appSessionId, resolvedToolName]);

  useEffect(() => {
    if (!host || !isLaunched || !resourceUri || !appSessionId || result === undefined) return;
    if (status !== 'complete') return;

    if (!sentResultRef.current || JSON.stringify(result) !== JSON.stringify(lastResultRef.current)) {
      sentResultRef.current = true;
      lastResultRef.current = result;
      const formattedResult =
        typeof result === 'string'
          ? { content: [{ type: 'text', text: result }] }
          : result;
      host.sendToolResult(formattedResult);
    }
  }, [host, isLaunched, result, status, resourceUri, appSessionId, resolvedToolName]);

  useEffect(() => {
    if (status === 'executing' && lastStatusRef.current !== 'executing') {
      sentInputRef.current = false;
      sentResultRef.current = false;
    }
    lastStatusRef.current = status;
  }, [status]);

  useEffect(() => {
    if (!host) return;
    // Merge user-provided hostContext with our internal displayMode, then notify the guest.
    // This causes Excalidraw (and other MCP apps) to switch between inline/fullscreen UI mode.
    const mergedCtx = {
      theme: APP_HOST_DEFAULTS.THEME,
      platform: APP_HOST_DEFAULTS.PLATFORM,
      containerDimensions: { maxHeight: APP_HOST_DEFAULTS.MAX_HEIGHT },
      availableDisplayModes: ['inline', 'fullscreen'],
      ...(hostContext || {}),
      displayMode, // always override with our authoritative state
    };
    host.setHostContext(mergedCtx);
  }, [host, hostContext, displayMode]);

  useEffect(() => {
    if (host && toolInputPartial) host.sendToolInputPartial(toolInputPartial);
  }, [host, toolInputPartial]);

  useEffect(() => {
    if (host && toolCancelled) host.sendToolCancelled("User cancelled");
  }, [host, toolCancelled]);

  if (!metadata && !html && !toolResourceUri) {
    return null;
  }

  const displayError = error || hostError;
  if (displayError) {
    return (
      <div className={`p-4 bg-red-900/20 border border-red-700 rounded text-red-200 ${className || ''}`}>
        Error: {displayError.message || String(displayError)}
      </div>
    );
  }

  const opacityClass = isLaunched ? 'opacity-100' : 'opacity-0';
  let containerClass = `w-full border border-gray-700 rounded bg-transparent my-2 relative ${className || ''}`;
  let iframeClass = `w-full transition-opacity duration-300 ${opacityClass}`;

  // When native fullscreen is active, the container naturally expands via the browser API.
  // We only need to satisfy flex layout so the iframe fills 100% of the fullscreen viewport.
  if (displayMode === 'fullscreen') {
    containerClass = `w-full h-full bg-black m-0 p-0 flex flex-col relative`;
    iframeClass = `w-full flex-1 transition-opacity duration-300 ${opacityClass}`;
  }

  return (
    <div ref={containerRef} className={containerClass}>
      {displayMode === 'fullscreen' && (
        <div className="absolute top-0 right-0 p-2 z-[100000] w-full bg-gradient-to-b from-black/80 to-transparent flex justify-end">
          <button 
            title="Exit Fullscreen"
            onClick={() => {
              // Eagerly restore height before the browser animation completes
              restoreHeightAfterFullscreen();
              if (document.fullscreenElement) document.exitFullscreen();
              setDisplayModeWithRef('inline');
            }} 
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-md shadow flex items-center gap-2 border border-gray-600 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/></svg>
            <span className="text-sm font-medium">Exit</span>
          </button>
        </div>
      )}
      <iframe
        ref={iframeRef}
        sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups allow-downloads"
        allow="fullscreen"
        className={iframeClass}
        title="MCP App"
      />
      {!isLaunched && loader && (
        <div className="absolute inset-0 bg-transparent flex items-center justify-center pointer-events-none z-10">
          {loader}
        </div>
      )}
    </div>
  );
});

const McpAppView = memo(McpAppViewInner);
McpAppView.displayName = 'McpAppView';

/**
 * Renders an interactive MCP application inside a sandboxed iframe.
 */
export const McpAppRenderer = memo(
  forwardRef<McpAppRendererHandle, McpAppRendererProps>(function McpAppRenderer(
    { client, ...props },
    ref
  ) {
    const clientRef = useRef(client || null);
    clientRef.current = client || null;

    return <McpAppView ref={ref} clientRef={clientRef} {...props} />;
  })
);

/**
 * Helpers scoped to one `mcpClient`. Pass the client here once; `McpAppRenderer` only needs per-tool props (`name`, `input`, `result`, `status`).
 *
 * @param mcpClient - From `useMcp()` or context (for example `useMcpContext()`).
 * @deprecated Use the standalone `<McpAppRenderer>` component and `getMcpAppMetadata` utility directly.
 */
export function useMcpApps(mcpClient: McpClient | null) {
  const getAppMetadata = useCallback(
    (toolName: string) => getMcpAppMetadata(mcpClient, toolName),
    [mcpClient]
  );

  const BoundMcpAppRenderer = useMemo(() => {
    const Renderer = forwardRef<McpAppRendererHandle, Omit<McpAppRendererProps, 'client'>>(
      function BoundMcpAppRenderer(props, ref) {
        return <McpAppRenderer ref={ref} client={mcpClient} {...props} />;
      }
    );
    Renderer.displayName = 'BoundMcpAppRenderer';
    return memo(Renderer);
  }, [mcpClient]);

  return { getAppMetadata, McpAppRenderer: BoundMcpAppRenderer };
}

function extractToolName(fullName: string): string {
  const match = fullName.match(/(?:tool_[^_]+_)?(.+)$/);
  return match?.[1] || fullName;
}

export function getMcpAppMetadata(
  mcpClient: McpClient | null,
  toolName: string,
  input?: Record<string, unknown> | null
): McpAppMetadata | undefined {
  if (!mcpClient) return undefined;

  const { toolName: proxyToolName } = resolveMetaToolProxy(toolName, input);
  const extractedName = extractToolName(proxyToolName);

  for (const conn of mcpClient.connections) {
    for (const tool of conn.tools) {
      const candidateName = extractToolName(tool.name);
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
}
