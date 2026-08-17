import type { McpToolDescriptor, ToolCallParams } from "@mcp-ts/bridge-protocol";
import { normalizeMcpToolResult } from "@mcp-ts/codemode";
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

async function loadLocalEntries(explicitContext?: { env?: Record<string, unknown>; userId?: string }): Promise<LocalToolEntry[]> {
  const context = explicitContext ?? getRequestContext();
  const env = context.env;
  const userId = context.userId;
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

export async function listLocalTools(explicitContext?: { env?: Record<string, unknown>; userId?: string }): Promise<LocalToolEntry[]> {
  return loadLocalEntries(explicitContext);
}

export async function listLocalServers(explicitContext?: { env?: Record<string, unknown>; userId?: string }): Promise<
  { serverName: string; serverId: string; toolCount: number }[]
> {
  const servers = new Map<string, { serverName: string; toolCount: number }>();
  for (const entry of await loadLocalEntries(explicitContext)) {
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
  explicitContext?: { env?: Record<string, unknown>; userId?: string }
): Promise<LocalToolEntry | undefined> {
  const targetTool = toolName.toLowerCase();
  const targetServer = serverId?.toLowerCase();
  return (await loadLocalEntries(explicitContext)).find(
    (entry) =>
      entry.name.toLowerCase() === targetTool &&
      (!targetServer ||
        entry.serverId.toLowerCase() === targetServer ||
        entry.serverName.toLowerCase() === targetServer),
  );
}

export async function invokeLocalTool(
  call: ToolCallParams,
  explicitContext?: { env?: Record<string, unknown>; userId?: string }
): Promise<unknown> {
  const active = getRequestContext();
  const env = explicitContext?.env ?? active.env;
  const userId = explicitContext?.userId ?? active.userId;
  if (!env || !userId) throw new Error("Authenticated bridge context is unavailable");
  return bridgeStub(env, userId).invokeLocal(call);
}

export async function buildLocalToolServers(explicitContext?: { env?: Record<string, unknown>; userId?: string }): Promise<
  {
    serverId: string;
    serverName?: string;
    listTools: () => Promise<{ tools: Record<string, unknown>[] }>;
    callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
    callToolRaw?: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  }[]
> {
  const context = explicitContext ?? getRequestContext();
  const env = context.env;
  const userId = context.userId;

  const byServer = new Map<string, { serverName: string; tools: LocalToolEntry[] }>();
  for (const entry of await loadLocalEntries(context)) {
    const current = byServer.get(entry.serverId);
    if (current) current.tools.push(entry);
    else byServer.set(entry.serverId, { serverName: entry.serverName, tools: [entry] });
  }

  return [...byServer].map(([serverId, server]) => ({
    serverId,
    serverName: server.serverName,
    listTools: async () => ({ tools: server.tools }),
    callTool: async (toolName: string, args: Record<string, unknown>) => {
      const active = getRequestContext();
      const effectiveEnv = active.env ?? env;
      const effectiveUserId = active.userId ?? userId;
      if (!effectiveEnv || !effectiveUserId) {
        throw new Error("Authenticated bridge context is unavailable");
      }
      const raw = await bridgeStub(effectiveEnv, effectiveUserId).invokeLocal({
        serverId,
        toolName,
        arguments: args ?? {},
      });
      return normalizeMcpToolResult(raw);
    },
    callToolRaw: async (toolName: string, args: Record<string, unknown>) => {
      const active = getRequestContext();
      const effectiveEnv = active.env ?? env;
      const effectiveUserId = active.userId ?? userId;
      if (!effectiveEnv || !effectiveUserId) {
        throw new Error("Authenticated bridge context is unavailable");
      }
      return bridgeStub(effectiveEnv, effectiveUserId).invokeLocal({
        serverId,
        toolName,
        arguments: args ?? {},
      });
    },
  }));
}
