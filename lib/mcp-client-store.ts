'use client';

import type { McpClient } from '@mcp-ts/client/react';

type StoredMcpClient = Pick<McpClient, 'connections' | 'sseClient'>;

const mcpClientRef = {
  current: null as StoredMcpClient | null,
};

const listeners = new Set<() => void>();

export function setMcpClient(client: StoredMcpClient | null) {
  mcpClientRef.current = client;
  listeners.forEach((listener) => listener());
}

export function getMcpClient() {
  return mcpClientRef.current;
}

export function subscribeToMcpClient(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
