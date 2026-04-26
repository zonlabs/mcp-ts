'use client';

import { McpAppRenderer as SdkMcpAppRenderer, DEFAULT_MCP_APP_CSP } from '@mcp-ts/sdk/client/react';
import { getMcpClient } from '@/lib/mcp-client-store';

interface ToolCallRendererProps {
  name: string;
  args: Record<string, unknown> | undefined;
  result: unknown;
  status: 'executing' | 'inProgress' | 'complete' | 'idle';
}

export function McpAppRenderer({ name, args, result, status }: ToolCallRendererProps) {
  const mcpClient = getMcpClient();

  const normalizedStatus = status === 'complete' || status === 'inProgress' || status === 'executing'
    ? status
    : 'executing';

  return (
    <SdkMcpAppRenderer
      client={mcpClient}
      name={name}
      input={args}
      result={result}
      status={normalizedStatus}
      sandbox={{
        url: "/sandbox.html",
        csp: DEFAULT_MCP_APP_CSP,
      }}
    />
  );
}