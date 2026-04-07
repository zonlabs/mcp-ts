'use client';

const mcpClientRef = {
  current: null as any,
};

export function setMcpClient(client: any) {
  mcpClientRef.current = client;
}

export function getMcpClient() {
  return mcpClientRef.current;
}