/**
 * Authentication Popup Utilities
 * Reusable utilities for handling OAuth/authentication flows in popup windows
 */

export interface AuthPopupOptions {
  url: string;
  width?: number;
  height?: number;
  windowName?: string;
}

export interface AuthPopupResult {
  sessionId?: string;
  serverName?: string;
  serverId?: string;
  serverUrl?: string;
  code?: string;
  state?: string;
}

const pendingAuthPopups = new Map<string, Promise<AuthPopupResult>>();
const AUTH_CHANNEL_NAME = 'mcp-auth-channel';
const POPUP_CLOSED_GRACE_MS = 5 * 60 * 1000;

function createAuthBroadcastChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') {
    return null;
  }

  try {
    return new BroadcastChannel(AUTH_CHANNEL_NAME);
  } catch {
    return null;
  }
}

/**
 * Open OAuth authorization URL in a popup window and wait for callback
 * @param options - Popup configuration
 * @returns Promise that resolves with session data when auth succeeds
 */
export function openAuthPopup(options: AuthPopupOptions): Promise<AuthPopupResult> {
  const { url, width = 600, height = 700, windowName = 'auth-popup' } = options;

  const existing = pendingAuthPopups.get(windowName);
  if (existing) return existing;

  // Calculate center position relative to parent window
  const left = Math.round(window.screenX + (window.outerWidth - width) / 2);
  const top = Math.round(window.screenY + (window.outerHeight - height) / 2);

  // Return promise that resolves when we receive the postMessage
  const promise = new Promise<AuthPopupResult>((resolve, reject) => {
    let messageReceived = false;
    let settled = false;
    let popup: Window | null = null;
    let popupCheckInterval: ReturnType<typeof setInterval> | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let popupClosedDetectedAt: number | null = null;

    const handleAuthMessage = (data: unknown) => {
      if (settled) return;

      if (!data || typeof data !== 'object') return;

      const { type, sessionId, serverName, serverId, serverUrl, error, code, state } = data as {
        type?: string;
        sessionId?: string;
        serverName?: string;
        serverId?: string;
        serverUrl?: string;
        error?: string;
        code?: string;
        state?: string;
      };

      if (type === 'mcp-auth-success') {
        settled = true;
        messageReceived = true;
        cleanup(false);
        resolve({ sessionId, serverName, serverId, serverUrl });
      } else if (type === 'MCP_AUTH_CODE') {
        settled = true;
        messageReceived = true;
        cleanup(false);
        resolve({ sessionId: sessionId || state, serverName, serverId, serverUrl, code, state });
      } else if (type === 'mcp-auth-error') {
        settled = true;
        messageReceived = true;
        cleanup(false);
        reject(new Error(error || 'Authentication failed'));
      }
    };

    // Listen for postMessage from popup
    const handleMessage = (event: MessageEvent) => {
      if (settled) return;

      if (event.origin !== window.location.origin) {
        return;
      }

      handleAuthMessage(event.data);
    };

    const channel = createAuthBroadcastChannel();
    const handleChannelMessage = (event: MessageEvent) => {
      handleAuthMessage(event.data);
    };

    if (channel) {
      channel.addEventListener('message', handleChannelMessage);
    }

    const closeChannel = () => {
      if (channel) {
        channel.removeEventListener('message', handleChannelMessage);
        channel.close();
      }
    };

    // Cleanup function
    const cleanup = (closePopup: boolean = false) => {
      window.removeEventListener('message', handleMessage);
      closeChannel();
      if (popupCheckInterval) {
        clearInterval(popupCheckInterval);
      }
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      if (closePopup && popup && !popup.closed) {
        popup.close();
      }
    };

    // Add listeners before opening the popup so fast OAuth redirects cannot race us.
    window.addEventListener('message', handleMessage);

    popup = window.open(
      url,
      windowName,
      `width=${width},height=${height},left=${left},top=${top},popup=yes,toolbar=no,menubar=no,location=no,status=no,resizable=yes,scrollbars=yes`
    );

    if (!popup) {
      settled = true;
      cleanup(false);
      reject(new Error('Failed to open popup window. Please allow popups for this site.'));
      return;
    }

    popup.focus();

    // Some providers use COOP and make popup.closed report true while the popup
    // is still visible. Keep listening for the callback page's BroadcastChannel
    // message before treating a closed signal as cancellation.
    popupCheckInterval = setInterval(() => {
      if (popup?.closed) {
        const now = Date.now();
        if (popupClosedDetectedAt === null) {
          popupClosedDetectedAt = now;
        }

        if (!messageReceived && now - popupClosedDetectedAt >= POPUP_CLOSED_GRACE_MS) {
          settled = true;
          cleanup(false);
          reject(new Error('Authentication was cancelled'));
        }
      } else if (popupClosedDetectedAt !== null) {
        popupClosedDetectedAt = null;
      }
    }, 500);

    // Timeout after 10 minutes
    timeoutId = setTimeout(() => {
      if (!messageReceived) {
        settled = true;
        cleanup(true);
        reject(new Error('Authentication timeout - please try again'));
      }
    }, 10 * 60 * 1000);
  });

  pendingAuthPopups.set(windowName, promise);
  return promise.finally(() => {
    pendingAuthPopups.delete(windowName);
  });
}
