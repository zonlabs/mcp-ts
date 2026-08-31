import { useMemo } from 'react';
import {
  McpAppRenderer as SdkMcpAppRenderer,
  DEFAULT_MCP_APP_CSP,
  getMcpAppMetadata,
} from '@mcp-ts/client/react';
import { useMcpContext } from '@/components/providers/McpProvider';

interface ToolCallRendererProps {
  name: string;
  args: Record<string, unknown> | undefined;
  result: unknown;
  status: 'executing' | 'inProgress' | 'complete' | 'idle';
  className?: string;
}

export function McpAppRenderer({ name, args, result, status, className }: ToolCallRendererProps) {
  const { connections, sseClient } = useMcpContext();
  const mcpClient = useMemo(
    () => ({ connections, sseClient: sseClient as any }),
    [connections, sseClient]
  );

  const normalizedStatus = status === 'complete' || status === 'inProgress' || status === 'executing'
    ? status
    : 'executing';

  if (!mcpClient) {
    return null;
  }

  const metadata = getMcpAppMetadata(mcpClient, name, args ?? null);
  if (!metadata) {
    return null;
  }

  const targetConnection = mcpClient.connections.find(
    (connection: { sessionId: string; state?: string }) => connection.sessionId === metadata.sessionId
  );
  const connectionState = targetConnection?.state;

  if (connectionState !== 'READY') {
    return (
      <div className="w-full my-2 rounded border border-gray-700 bg-transparent px-4 py-3 text-sm text-muted-foreground">
        Preparing MCP app...
      </div>
    );
  }

  return (
    <SdkMcpAppRenderer
      key={`${metadata.sessionId}:${metadata.resourceUri}`}
      client={mcpClient}
      name={name}
      input={args}
      result={result}
      status={normalizedStatus}
      sandbox={{
        url: "/sandbox.html",
        csp: DEFAULT_MCP_APP_CSP,
      }}
      className={className}
    />
  );
}
