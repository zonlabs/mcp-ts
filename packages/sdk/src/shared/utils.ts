import { customAlphabet, nanoid } from 'nanoid';

const OAUTH_STATE_SEPARATOR = '.';

const serverIdAlphabet = customAlphabet(
    'abcdefghijklmnopqrstuvwxyz0123456789',
    12
);

/**
 * Sanitize server name to create a valid server label
 * Must start with a letter and contain only letters, digits, '-' and '_'
 */
export function sanitizeServerLabel(name: string): string {
  let sanitized = name
    .replace(/[^a-zA-Z0-9-_]/g, '_')
    .replace(/_{2,}/g, '_')
    .toLowerCase();

  if (!/^[a-zA-Z]/.test(sanitized)) {
    sanitized = 's_' + sanitized;
  }

  return sanitized;
}

/**
 * Generates a session ID with a human-readable prefix for easy identification.
 * Format: sess_<21-char nanoid> (26 chars total).
 * Not used in tool names, so length is not constrained.
 */
export function generateSessionId(): string {
    return 'sess_' + nanoid(21);
}

/**
 * Generates a short server ID suitable for use in tool names.
 * 12-char alphanumeric string that keeps tool_<serverId>_<toolName> under 64 chars.
 */
export function generateServerId(): string {
    return serverIdAlphabet();
}

export interface ParsedOAuthState {
  nonce: string;
  sessionId: string;
}

export function formatOAuthState(nonce: string, sessionId: string): string {
  return `${nonce}${OAUTH_STATE_SEPARATOR}${sessionId}`;
}

export function parseOAuthState(state: string): ParsedOAuthState | undefined {
  const separatorIndex = state.indexOf(OAUTH_STATE_SEPARATOR);
  if (separatorIndex <= 0 || separatorIndex === state.length - 1) {
    return undefined;
  }

  const nonce = state.slice(0, separatorIndex);
  const sessionId = state.slice(separatorIndex + 1);
  if (!nonce || !sessionId || sessionId.includes(OAUTH_STATE_SEPARATOR)) {
    return undefined;
  }

  return { nonce, sessionId };
}
