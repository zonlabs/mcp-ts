import type { McpConnection, ToolInfo } from '@mcp-ts/sdk/shared';
import ConnectionCard from './ConnectionCard';

interface ConnectionListProps {
  connections: McpConnection[];
  onDisconnect: (sessionId: string) => Promise<void>;
  onCallTool: (sessionId: string, toolName: string, args: Record<string, unknown>) => Promise<unknown>;
}

export default function ConnectionList({ connections, onDisconnect, onCallTool }: ConnectionListProps) {
  if (connections.length === 0) {
    return (
      <div className="empty-state">
        <p>No active connections. Connect to an MCP server to get started.</p>
      </div>
    );
  }

  return (
    <div className="connection-list">
      {connections.map((connection) => (
        <ConnectionCard
          key={connection.sessionId}
          connection={connection}
          onDisconnect={onDisconnect}
          onCallTool={onCallTool}
        />
      ))}
    </div>
  );
}
