import type { McpToolDescriptor, ToolCallParams } from "@mcp-ts/bridge-protocol";
import { getRequestContext } from "./request-context";
import type { BridgeSession, BridgeSessionEnv } from "../durable-objects/bridge-session";

type BridgeSessionRpc = {
  getStatus(): Promise<{
    online: boolean;
    localCatalog: { servers: Array<{ serverId: string; serverName: string; tools: McpToolDescriptor[] }> };
  }>;
  invokeLocal(call: ToolCallParams): Promise<unknown>;
};

export type LocalToolEntry = McpToolDescriptor & {
  serverId: string;
  serverName: string;
  sessionId: string;
};

function bridgeStub(env: Record<string, unknown>, userId: string): BridgeSessionRpc {
  const namespace = (env as unknown as BridgeSessionEnv).BRIDGE_SESSION;
  return namespace.get(namespace.idFromName(userId)) as unknown as BridgeSessionRpc;
}

async function loadLocalEntries(): Promise<LocalToolEntry[]> {
  const { env, userId } = getRequestContext();
  if (!env || !userId) return [];
  try {
    const status = await bridgeStub(env, userId).getStatus();
    if (!status.online) return [];
    return status.localCatalog.servers.flatMap((server) =>
      server.tools.map((tool) => ({
        ...tool,
        serverId: server.serverId,
        serverName: server.serverName,
        sessionId: "local-bridge",
      })),
    );
  } catch {
    return [];
  }
}

export async function listLocalTools(): Promise<LocalToolEntry[]> {
  return loadLocalEntries();
}

export async function listLocalServers(): Promise<
  { serverName: string; serverId: string; toolCount: number }[]
> {
  const servers = new Map<string, { serverName: string; toolCount: number }>();
  for (const entry of await loadLocalEntries()) {
    const current = servers.get(entry.serverId);
    servers.set(entry.serverId, {
      serverName: entry.serverName,
      toolCount: (current?.toolCount ?? 0) + 1,
    });
  }
  return [...servers].map(([serverId, value]) => ({ serverId, ...value }));
}

export async function resolveLocalToolSchema(
  toolName: string,
  serverId?: string,
): Promise<LocalToolEntry | undefined> {
  return (await loadLocalEntries()).find(
    (entry) => entry.name === toolName && (!serverId || entry.serverId === serverId),
  );
}

export async function invokeLocalTool(call: ToolCallParams): Promise<unknown> {
  const { env, userId } = getRequestContext();
  if (!env || !userId) throw new Error("Authenticated bridge context is unavailable");
  return bridgeStub(env, userId).invokeLocal(call);
}

export async function buildLocalToolServers(): Promise<
  {
    serverId: string;
    serverName?: string;
    listTools: () => Promise<{ tools: Record<string, unknown>[] }>;
    callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  }[]
> {
  const byServer = new Map<string, { serverName: string; tools: LocalToolEntry[] }>();
  for (const entry of await loadLocalEntries()) {
    const current = byServer.get(entry.serverId);
    if (current) current.tools.push(entry);
    else byServer.set(entry.serverId, { serverName: entry.serverName, tools: [entry] });
  }

  return [...byServer].map(([serverId, server]) => ({
    serverId,
    serverName: server.serverName,
    listTools: async () => ({ tools: server.tools }),
    callTool: async (toolName, args) =>
      invokeLocalTool({ serverId, toolName, arguments: args ?? {} }),
  }));
}
