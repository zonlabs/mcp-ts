import { MCPClient, storage } from "@mcp-ts/sdk/server";

type SessionData = Awaited<ReturnType<typeof storage.getIdentitySessionsData>>[number];

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
  tools: McpToolSummary[];
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
  active: boolean,
  tools: McpToolSummary[] = []
): McpConnectionRecord {
  return {
    sessionId: session.sessionId,
    serverId: session.serverId ?? "unknown",
    serverName: session.serverName ?? "Unknown",
    serverUrl: session.serverUrl,
    transport: session.transportType ?? "streamable_http",
    createdAt: session.createdAt ?? Date.now(),
    active,
    connectionStatus: active ? "READY" : "FAILED",
    tools,
  };
}

export async function getMcpConnectionsForIdentity(
  identity: string
): Promise<McpConnectionRecord[]> {
  const sessions = await storage.getIdentitySessionsData(identity);

  const resolved = await Promise.all(
    sessions.map(async (session): Promise<McpConnectionRecord> => {
      const client = new MCPClient({
        identity,
        sessionId: session.sessionId,
      });

      try {
        await client.connect();
        const toolsResult = await client.listTools();
        const tools = sanitizeTools(
          Array.isArray(toolsResult?.tools) ? toolsResult.tools : []
        );
        return toConnectionRecord(session, true, tools);
      } catch {
        return toConnectionRecord(session, false, []);
      } finally {
        client.disconnect("mcp-connections-check");
        client.dispose();
      }
    })
  );

  return resolved;
}

export async function getActiveMcpConnections(
  identity: string
): Promise<McpConnectionRecord[]> {
  const connections = await getMcpConnectionsForIdentity(identity);
  return connections.filter((c) => c.active);
}
