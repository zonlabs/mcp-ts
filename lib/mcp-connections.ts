import { sessions } from "@mcp-ts/sdk/server";
import type { ToolPolicy } from "@/types/mcp";

type SessionData = Awaited<ReturnType<typeof sessions.list>>[number];

export interface McpConnectionRecord {
  sessionId: string;
  serverId: string;
  serverName: string;
  serverUrl: string;
  transport: string;
  createdAt: number;
  active: boolean;
  connectionStatus: string;
  toolPolicy?: ToolPolicy;
  enabled?: boolean;
}

function toConnectionRecord(
  session: SessionData,
  active: boolean,
): McpConnectionRecord {
  const sessionRecord = session as unknown as Record<string, unknown>;
  const legacyTransport = sessionRecord.transportType;

  return {
    sessionId: session.sessionId,
    serverId: session.serverId ?? "unknown",
    serverName: session.serverName ?? "Unknown",
    serverUrl: session.serverUrl,
    transport:
      session.serverOptions?.transport?.type ??
      (typeof legacyTransport === "string" ? legacyTransport : "streamable-http"),
    createdAt: session.createdAt ?? Date.now(),
    active,
    connectionStatus: active ? "READY" : "FAILED",
    toolPolicy: session.toolPolicy,
  };
}

function getStoredConnectionStatus(session: SessionData): string {
  const sessionRecord = session as unknown as Record<string, unknown>;

  if (typeof sessionRecord.status === "string") {
    return sessionRecord.status === "active" ? "READY" : "DISCONNECTED";
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

    return {
      ...toConnectionRecord(session, connectionStatus === "READY"),
      connectionStatus,
    };
  });
}

export async function getActiveMcpConnections(
  userId: string
): Promise<McpConnectionRecord[]> {
  const connections = await getStoredMcpConnectionsForIdentity(userId);
  return connections.filter((c) => c.active);
}


