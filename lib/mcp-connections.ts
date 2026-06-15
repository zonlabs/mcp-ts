import { MCPClient, sessions } from "@mcp-ts/sdk/server";

type SessionData = Awaited<ReturnType<typeof sessions.list>>[number];

export interface McpToolSummary {
  name: string;
  description?: string;
}

export interface McpConnectionRecord {
  sessionId: string;
  serverId: string;
  serverName: string;
  serverUrl: string;
  transport: string;
  createdAt: number;
  active: boolean;
  connectionStatus: string;
  // tools: McpToolSummary[];
}

function sanitizeTools(tools: any[] = []): McpToolSummary[] {
  return tools
    .filter((tool) => tool && typeof tool.name === "string")
    .map((tool) => ({
      name: tool.name,
      ...(typeof tool.description === "string" ? { description: tool.description } : {}),
    }));
}

function toConnectionRecord(
  session: SessionData,
  connectionStatus: string,
  // tools: McpToolSummary[] = []
): McpConnectionRecord {
  const normalizedStatus = connectionStatus.trim().toUpperCase();
  return {
    sessionId: session.sessionId,
    serverId: session.serverId ?? "unknown",
    serverName: session.serverName ?? "Unknown",
    serverUrl: session.serverUrl,
    transport: session.transportType ?? "streamable-http",
    createdAt: session.createdAt ?? Date.now(),
    active: normalizedStatus === "READY" || normalizedStatus === "CONNECTED",
    connectionStatus: normalizedStatus,
    // tools,
  };
}

function getStoredConnectionStatus(session: SessionData): string {
  const sessionRecord = session as unknown as Record<string, unknown>;
  const status = sessionRecord.status;

  if (typeof status === "string") {
    const normalized = status.trim().toLowerCase();
    if (normalized === "active") return "READY";
    if (normalized === "pending") return "CONNECTING";
  }

  if (typeof sessionRecord.active === "boolean") {
    return sessionRecord.active ? "READY" : "DISCONNECTED";
  }

  const state = sessionRecord.connectionStatus ?? sessionRecord.state;

  return typeof state === "string" && state.trim()
    ? state.trim().toUpperCase()
    : "DISCONNECTED";
}

export async function getStoredMcpConnectionsForIdentity(
  userId: string
): Promise<McpConnectionRecord[]> {
  const userSessions = await sessions.list(userId);

  return userSessions.map((session) => {
    const connectionStatus = getStoredConnectionStatus(session);

    return toConnectionRecord(session, connectionStatus);
  });
}

export async function getMcpConnectionsForIdentity(
  userId: string
): Promise<McpConnectionRecord[]> {
  const userSessions = await sessions.list(userId);

  const resolved = await Promise.all(
    userSessions.map(async (session): Promise<McpConnectionRecord> => {
      const client = new MCPClient({
        userId,
        sessionId: session.sessionId,
      });

      try {
        await client.connect();
        const toolsResult = await client.listTools();
        const tools = sanitizeTools(
          Array.isArray(toolsResult?.tools) ? toolsResult.tools : []
        );
        return toConnectionRecord(session, "READY");
      } catch {
        return toConnectionRecord(session, getStoredConnectionStatus(session));
      } finally {
        client.disconnect("mcp-connections-check");
        client.dispose();
      }
    })
  );

  return resolved;
}

export async function getActiveMcpConnections(
  userId: string
): Promise<McpConnectionRecord[]> {
  const connections = await getStoredMcpConnectionsForIdentity(userId);
  return connections.filter((c) => c.active);
}

