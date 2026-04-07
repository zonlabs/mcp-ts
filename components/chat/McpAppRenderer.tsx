'use client';

import { useMcpApps } from '@mcp-ts/sdk/client/react';
import { getMcpClient } from '@/lib/mcp-client-store';

interface ToolCallRendererProps {
  name: string;
  args: Record<string, unknown> | undefined;
  result: unknown;
  status: 'executing' | 'inProgress' | 'complete' | 'idle';
}

export function McpAppRenderer({ name, args, result, status }: ToolCallRendererProps) {
  const mcpClient = getMcpClient();
  const { McpAppRenderer: RenderMcpApp } = useMcpApps(mcpClient);

  if (!RenderMcpApp) {
    return null;
  }

  const normalizedStatus = status === 'complete' || status === 'inProgress' || status === 'executing'
    ? status
    : 'executing';

  return (
    <RenderMcpApp
      name={name}
      input={args}
      result={result}
      status={normalizedStatus}
    />
  );
}