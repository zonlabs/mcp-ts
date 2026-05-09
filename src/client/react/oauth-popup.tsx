import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

export interface OAuthPopupConnectionLike {
  sessionId: string;
  state: string;
  error?: string;
}

/**
 * Optional helpers for popup-based OAuth UX.
 *
 * These utilities sit on top of the core MCP auth primitives:
 * - `useMcp({ onRedirect })` to decide how auth navigation happens
 * - `finishAuth(sessionId, code)` to complete code exchange
 *
 * Consumers are free to:
 * - use these helpers as-is for a turnkey popup flow
 * - build their own popup UI/message bridge
 * - skip popups entirely and handle auth in a normal callback page
 */
export interface OAuthPopupRedirectOptions {
  width?: number;
  height?: number;
  windowName?: string;
  features?: string[];
  onBlocked?: (url: string) => void;
}

export interface McpOAuthCallbackContentProps {
  code?: string | null;
  sessionId?: string | null;
  title?: ReactNode;
  initialStatus?: string;
  loadingFallback?: ReactNode;
  rootStyle?: CSSProperties;
  cardStyle?: CSSProperties;
  titleStyle?: CSSProperties;
  messageStyle?: CSSProperties;
  renderContainer?: (content: ReactNode) => ReactNode;
  debugPhase?: 'loading' | 'success' | 'error';
}

const AUTH_CODE_MESSAGE = 'MCP_AUTH_CODE';
const AUTH_RESULT_MESSAGE = 'MCP_AUTH_RESULT';

function postPopupResult(
  popupWindow: WindowProxy | null,
  result: {
    sessionId?: string;
    success: boolean;
    error?: string;
  }
): void {
  const payload = {
    type: AUTH_RESULT_MESSAGE,
    ...result,
  };

  // 1. Direct postMessage to the specific window if known
  popupWindow?.postMessage(payload, window.location.origin);

  // 2. Broadcast to all listening windows (e.g. if opener reference was lost)
  try {
    const channel = new BroadcastChannel('mcp-auth-channel');
    channel.postMessage(payload);
    channel.close();
  } catch (err) {
    // BroadcastChannel might not be supported in very old environments, but that's okay as postMessage is the primary path
    console.warn('[useMcpOAuthPopup] Failed to broadcast result:', err);
  }
}

/**
 * Opens a centered popup window for OAuth.
 *
 * Convenience only: callers can replace this entirely with their own popup,
 * modal, redirect, or router-based navigation strategy.
 */
export function openCenteredPopup(url: string, options: OAuthPopupRedirectOptions = {}): Window | null {
  const {
    width = 600,
    height = 700,
    windowName = 'mcp-auth-popup',
    features = [],
    onBlocked,
  } = options;

  const left = window.screenX + (window.outerWidth - width) / 2;
  const top = window.screenY + (window.outerHeight - height) / 2;
  const featureList = [
    `width=${width}`,
    `height=${height}`,
    `left=${left}`,
    `top=${top}`,
    'resizable=yes',
    'scrollbars=yes',
    'status=yes',
    ...features,
  ].join(',');

  const popup = window.open(url, windowName, featureList);
  if (!popup) {
    onBlocked?.(url);
  }

  return popup;
}

/**
 * Creates an `onRedirect` handler suitable for `useMcp({ onRedirect })`.
 *
 * This is the simplest popup entry point, but it is intentionally optional.
 * Applications can provide any redirect handler they want, including full-page
 * navigation or a completely custom popup implementation.
 */
export function createOAuthPopupRedirectHandler(
  options: OAuthPopupRedirectOptions = {}
): (url: string) => void {
  return (url: string) => {
    openCenteredPopup(url, {
      ...options,
      onBlocked: options.onBlocked ?? ((blockedUrl) => {
        window.alert('Popup blocked! Allow popups for this site to complete authentication.');
        window.location.href = blockedUrl;
      }),
    });
  };
}

/**
 * Handles opener-side popup coordination for OAuth code exchange.
 *
 * Use this when you want popup auth but do not want to reimplement the
 * postMessage wiring between the main app window and the popup callback page.
 *
 * If you are not using a popup flow, you do not need this hook.
 */
const processedCodesGlobal = new Set<string>();

export function useMcpOAuthPopup<TConnection extends OAuthPopupConnectionLike>(
  connections: TConnection[],
  finishAuth: (sessionId: string, code: string) => Promise<unknown>
): void {
  const pendingPopupsRef = useRef<Map<string, WindowProxy>>(new Map());


  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      console.log('[useMcpOAuthPopup] Message received:', event.data);
      // 1. Verify origin for security (ignore for BroadcastChannel messages which don't have origin or have same origin)
      if (event.origin && event.origin !== window.location.origin) {
        console.warn('[useMcpOAuthPopup] Origin mismatch:', event.origin, 'expected:', window.location.origin);
        return;
      }


      if (event.data?.type !== AUTH_CODE_MESSAGE || !event.data.code) {
        return;
      }

      const popupWindow = event.source && 'postMessage' in event.source
        ? event.source as WindowProxy
        : null;
      const targetSessionId = typeof event.data.sessionId === 'string' ? event.data.sessionId : '';

      // Capture the popup window reference if we have it, so we can notify it later
      // even if this specific message is a duplicate code signal.
      if (popupWindow && targetSessionId) {
        pendingPopupsRef.current.set(targetSessionId, popupWindow);
      }

      // Deduplicate: Don't process the same code twice
      if (processedCodesGlobal.has(event.data.code)) {
        console.log('[useMcpOAuthPopup] Code already processed (global), ignoring:', event.data.code);
        
        // If the session is already authenticated or ready, notify the popup immediately
        // (This handles cases where the popup sends multiple signals or a late signal)
        const existingConn = connections.find(c => c.sessionId === targetSessionId);
        if (existingConn?.state === 'AUTHENTICATED' || existingConn?.state === 'READY') {
          postPopupResult(popupWindow, {
            sessionId: targetSessionId,
            success: true,
          });
          pendingPopupsRef.current.delete(targetSessionId);
        }
        return;
      }
      processedCodesGlobal.add(event.data.code);

      if (!targetSessionId) {
        if (popupWindow) {
          postPopupResult(popupWindow, {
            success: false,
            error: 'Missing OAuth session identifier',
          });
        }
        return;
      }

      const targetSession = connections.find((connection) => connection.sessionId === targetSessionId);
      if (!targetSession) {
        if (popupWindow) {
          postPopupResult(popupWindow, {
            sessionId: targetSessionId,
            success: false,
            error: 'OAuth session not found in the current client state',
          });
        }
        return;
      }

      try {
        await finishAuth(targetSession.sessionId, event.data.code);
      } catch (error) {
        pendingPopupsRef.current.delete(targetSession.sessionId);
        if (popupWindow) {
          postPopupResult(popupWindow, {
            sessionId: targetSession.sessionId,
            success: false,
            error: error instanceof Error ? error.message : 'Failed to finish auth',
          });
        }
      }
    };

    // Listen on both postMessage and BroadcastChannel
    const channel = new BroadcastChannel('mcp-auth-channel');
    const handleChannelMessage = (event: MessageEvent) => {
      if (event.data?.type === AUTH_CODE_MESSAGE) {
        void handleMessage(event);
      }
    };

    window.addEventListener('message', handleMessage);
    channel.addEventListener('message', handleChannelMessage);
    
    return () => {
      window.removeEventListener('message', handleMessage);
      channel.removeEventListener('message', handleChannelMessage);
      channel.close();
    };

  }, [connections, finishAuth]);

  useEffect(() => {
    for (const connection of connections) {
      const popupWindow = pendingPopupsRef.current.get(connection.sessionId) || null;

      if (connection.state === 'AUTHENTICATED' || connection.state === 'READY' || connection.state === 'CONNECTED') {
        postPopupResult(popupWindow, {
          sessionId: connection.sessionId,
          success: true,
        });
        pendingPopupsRef.current.delete(connection.sessionId);
        continue;
      }

      if (connection.state === 'FAILED') {
        postPopupResult(popupWindow, {
          sessionId: connection.sessionId,
          success: false,
          error: connection.error || 'Failed to complete authorization',
        });
        pendingPopupsRef.current.delete(connection.sessionId);
      }
    }
  }, [connections]);
}

/**
 * Default popup callback UI for popup-based OAuth flows.
 *
 * This component reads the OAuth `code` and `state/sessionId`, notifies the
 * opener window, waits for success/failure, and closes the popup on success.
 *
 * It is intentionally optional: apps can replace it with their own callback
 * page UI or skip popup auth entirely and call `finishAuth(sessionId, code)`
 * from any callback route they control.
 */
export function McpOAuthCallbackContent({
  code,
  sessionId,
  title = 'Verifying Authorization',
  initialStatus = 'Completing your authorization...',
  loadingFallback = 'Loading...',
  rootStyle,
  cardStyle,
  titleStyle,
  messageStyle,
  renderContainer,
  debugPhase,
}: McpOAuthCallbackContentProps): JSX.Element {
  const [phase, setPhase] = useState<'loading' | 'success' | 'error'>(debugPhase || 'loading');
  const [errorMessage, setErrorMessage] = useState('');

  const openerMissing = typeof window !== 'undefined' ? !window.opener : false;
  const missingCode = !code;
  const missingSessionId = !sessionId;
  const blockingError = openerMissing
    ? 'Error: No opener window found. This window should be opened from the app.'
    : missingCode
      ? 'Error: No authorization code received.'
      : missingSessionId
        ? 'Error: No OAuth state received.'
        : null;

  useEffect(() => {
    if (debugPhase) {
      setPhase(debugPhase);
      if (debugPhase === 'error') setErrorMessage('Test error message representing a real failure.');
      return;
    }

    if (blockingError) {
      setPhase('error');
      setErrorMessage(blockingError);
      return;
    }

    const channel = new BroadcastChannel('mcp-auth-channel');
    const handleResult = (event: MessageEvent) => {
      if (event.origin && event.origin !== window.location.origin) {
        return;
      }

      if (event.data?.type !== AUTH_RESULT_MESSAGE) {
        return;
      }

      if (event.data.sessionId !== sessionId) {
        return;
      }

      if (event.data.success) {
        setPhase('success');
        window.removeEventListener('message', handleResult);
        channel.close();
        closed = true;
        window.setTimeout(() => window.close(), 1200);
        return;
      }

      const message =
        typeof event.data.error === 'string' && event.data.error.length > 0
          ? event.data.error
          : 'Failed to complete authorization.';
      setPhase('error');
      setErrorMessage(message);
    };

    window.addEventListener('message', handleResult);
    channel.addEventListener('message', handleResult);

    const payload = { type: AUTH_CODE_MESSAGE, code, sessionId };

    // 1. Try postMessage to opener
    if (window.opener) {
      try {
        window.opener.postMessage(payload, window.location.origin);
      } catch (error) {
        console.warn('Failed to postMessage to opener:', error);
      }
    }

    // 2. Also try BroadcastChannel
    try {
      channel.postMessage(payload);
    } catch (error) {
      console.warn('Failed to post to BroadcastChannel:', error);
    }

    return () => {
      if (!closed) {
        window.removeEventListener('message', handleResult);
        channel.close();
      }
    };

  }, [blockingError, code, sessionId, debugPhase]);

  const loadingBubbles = (
    <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', height: '12px', alignItems: 'center' }}>
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: 'currentColor',
            opacity: 0.3,
            animation: `mcp-pulse 1.2s ease-in-out infinite`,
            animationDelay: `${delay}ms`,
          }}
        />
      ))}
    </div>
  );

  const content = (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        flexDirection: 'column',
        backgroundColor: '#fafafa',
        color: '#18181b',
        boxSizing: 'border-box',
        padding: '1.5rem',
        ...rootStyle,
      }}
    >
      <style>
        {`
          @keyframes mcp-pulse { 0%, 100% { transform: scale(0.8); opacity: 0.4; } 50% { transform: scale(1.2); opacity: 1; } }
          @keyframes mcp-fade-up { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        `}
      </style>
      <div
        style={{
          backgroundColor: '#fff',
          borderRadius: '20px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.05)',
          width: '100%',
          maxWidth: '400px',
          overflow: 'hidden',
          border: '1px solid #f4f4f5',
          display: 'flex',
          flexDirection: 'column',
          ...cardStyle,
        }}
      >
        <div style={{ padding: '3rem 2rem', textAlign: 'center', animation: 'mcp-fade-up 0.4s ease-out' }}>
          {phase === 'loading' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '48px', width: '48px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #f1f5f9', color: '#64748b' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <h2 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600, ...titleStyle }}>{title}</h2>
                <p style={{ margin: 0, fontSize: '0.9rem', color: '#71717a', lineHeight: 1.5, ...messageStyle }}>
                  {initialStatus}
                </p>
              </div>
              {loadingBubbles}
            </div>
          )}

          {phase === 'success' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center' }}>
              <svg style={{ color: '#10b981' }} width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M8 12l3 3 5-5" />
              </svg>
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600, ...titleStyle }}>Connected</h2>
              <p style={{ margin: 0, fontSize: '0.9rem', color: '#71717a', lineHeight: 1.5, ...messageStyle }}>
                Authorization complete. This window will close automatically.
              </p>
            </div>
          )}

          {phase === 'error' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center' }}>
              <svg style={{ color: '#ef4444' }} width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M15 9l-6 6M9 9l6 6" />
              </svg>
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600, ...titleStyle }}>Connection Failed</h2>
              <p style={{ margin: 0, fontSize: '0.9rem', color: '#ef4444', fontWeight: 500, ...messageStyle }}>
                {errorMessage}
              </p>
              <button
                onClick={() => window.close()}
                style={{
                  marginTop: '0.5rem', padding: '0.625rem 1.25rem', border: 'none', borderRadius: '8px',
                  backgroundColor: '#fef2f2', color: '#ef4444', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem'
                }}
              >
                Close Window
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  if (renderContainer) {
    return <>{renderContainer(content)}</>;
  }

  return content;
}

/**
 * Tiny fallback component for Suspense-wrapped callback pages.
 */
export function McpOAuthCallbackFallback({
  children = 'Loading...',
}: {
  children?: ReactNode;
}): JSX.Element {
  return <>{children || 'Loading...'}</>;
}
