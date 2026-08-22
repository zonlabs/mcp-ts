import { normalizeServerUrl } from '@/lib/url';
import type { McpConnection } from '@mcp-ts/client/react';

export type StoredConnection = McpConnection;

/**
 * Normalizes connection status string to a consistent UI state.
 */
export function normalizeConnectionStatus(status?: string | null): 'READY' | 'CONNECTING' | 'DISCONNECTED' | 'FAILED' {
  if (!status) return 'DISCONNECTED';
  const s = status.toUpperCase().trim();
  if (s === 'READY' || s === 'CONNECTED') return 'READY';
  if (s === 'CONNECTING' || s === 'AUTHENTICATING' || s === 'DISCOVERING') return 'CONNECTING';
  if (s === 'FAILED' || s === 'ERROR') return 'FAILED';
  return 'DISCONNECTED';
}

/**
 * Robustly matches an MCP server (catalog or custom) to an active connection.
 */
export function findConnectionForServer<
  T extends { id?: string; url?: string | null; remoteUrl?: string | null; name?: string }
>(
  connections: Record<string, McpConnection> | McpConnection[],
  server?: T | null
): McpConnection | undefined {
  if (!server) return undefined;
  const list = Array.isArray(connections) ? connections : Object.values(connections);
  const serverId = server.id;
  const serverUrl = server.remoteUrl || server.url;
  const normalizedUrl = serverUrl ? normalizeServerUrl(serverUrl) : null;

  return list.find((c) => {
    if (!c) return false;
    if (serverId && (c.metadata?.catalogServerId === serverId || c.serverId === serverId || c.sessionId === serverId)) {
      return true;
    }
    if (normalizedUrl && c.serverUrl && normalizeServerUrl(c.serverUrl) === normalizedUrl) {
      return true;
    }
    return false;
  });
}
