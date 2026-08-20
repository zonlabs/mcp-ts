/**
 * Clean MCP OAuth Popup Management
 */

export interface AuthPopupOptions {
  url: string;
  width?: number;
  height?: number;
}

export interface AuthPopupResult {
  sessionId?: string;
  serverName?: string;
  serverId?: string;
  serverUrl?: string;
  code?: string;
  state?: string;
}

const AUTH_CHANNEL_NAME = 'mcp-auth-channel';
let currentPopup: Window | null = null;
let currentReject: ((err: Error) => void) | null = null;
let currentCleanup: (() => void) | null = null;

export function closeActiveAuthPopup(): void {
  if (currentReject) {
    try {
      currentReject(new Error('Authentication cancelled'));
    } catch {
      // ignore
    }
    currentReject = null;
  }
  if (currentCleanup) {
    try {
      currentCleanup();
    } catch {
      // ignore
    }
    currentCleanup = null;
  }
  if (currentPopup) {
    try {
      currentPopup.close();
    } catch {
      // ignore
    }
    currentPopup = null;
  }
}

/**
 * Opens an OAuth popup window and waits for completion or cancellation.
 */
export function openAuthPopup(options: AuthPopupOptions): Promise<AuthPopupResult> {
  const { url, width = 600, height = 700 } = options;

  // Clean up any existing active popup
  closeActiveAuthPopup();

  const left = Math.round(window.screenX + (window.outerWidth - width) / 2);
  const top = Math.round(window.screenY + (window.outerHeight - height) / 2);

  return new Promise<AuthPopupResult>((resolve, reject) => {
    currentReject = reject;
    let settled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    let broadcastChannel: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        broadcastChannel = new BroadcastChannel(AUTH_CHANNEL_NAME);
      } catch {
        broadcastChannel = null;
      }
    }

    const cleanup = () => {
      window.removeEventListener('message', onWindowMessage);
      if (broadcastChannel) {
        broadcastChannel.removeEventListener('message', onChannelMessage);
        broadcastChannel.close();
        broadcastChannel = null;
      }
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      if (currentPopup) {
        try {
          currentPopup.close();
        } catch {
          // ignore
        }
        currentPopup = null;
      }
      if (currentReject === reject) {
        currentReject = null;
      }
      if (currentCleanup === cleanup) {
        currentCleanup = null;
      }
    };

    currentCleanup = cleanup;

    const handlePayload = (data: unknown) => {
      if (settled || !data || typeof data !== 'object') return;

      const payload = data as {
        type?: string;
        sessionId?: string;
        serverName?: string;
        serverId?: string;
        serverUrl?: string;
        error?: string;
        code?: string;
        state?: string;
      };

      if (payload.type === 'mcp-auth-success') {
        settled = true;
        cleanup();
        resolve({
          sessionId: payload.sessionId,
          serverName: payload.serverName,
          serverId: payload.serverId,
          serverUrl: payload.serverUrl,
        });
      } else if (payload.type === 'MCP_AUTH_CODE') {
        settled = true;
        cleanup();
        resolve({
          sessionId: payload.sessionId || payload.state,
          serverName: payload.serverName,
          serverId: payload.serverId,
          serverUrl: payload.serverUrl,
          code: payload.code,
          state: payload.state || payload.sessionId,
        });
      } else if (payload.type === 'mcp-auth-error') {
        settled = true;
        cleanup();
        reject(new Error(payload.error || 'Authentication failed'));
      }
    };

    const onWindowMessage = (event: MessageEvent) => {
      if (settled || event.origin !== window.location.origin) return;
      handlePayload(event.data);
    };

    const onChannelMessage = (event: MessageEvent) => {
      if (settled) return;
      handlePayload(event.data);
    };

    window.addEventListener('message', onWindowMessage);
    if (broadcastChannel) {
      broadcastChannel.addEventListener('message', onChannelMessage);
    }

    const popup = window.open(
      url,
      'mcp-oauth-popup',
      `width=${width},height=${height},left=${left},top=${top},popup=yes,toolbar=no,menubar=no,location=no,status=no,resizable=yes,scrollbars=yes`
    );

    if (!popup) {
      settled = true;
      cleanup();
      reject(new Error('Failed to open popup window. Please allow popups for this site.'));
      return;
    }

    currentPopup = popup;
    popup.focus();

    // 10-minute timeout
    timeoutId = setTimeout(() => {
      if (!settled) {
        settled = true;
        cleanup();
        reject(new Error('Authentication timed out. Please try again.'));
      }
    }, 10 * 60 * 1000);
  });
}
