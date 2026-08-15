import { getRequestContext } from "./request-context";
import { invokeDevice, loadDeviceStatus, loadUserDeviceIds } from "../device-bridge";
import type { ServerInfo } from "../device";

/** Synthetic tool-router server id for a device's local server. */
export function deviceServerId(deviceId: string, serverName: string): string {
  return `device:${deviceId}:${serverName}`;
}

export type DeviceToolEntry = {
  name: string;
  description?: string;
  inputSchema?: unknown;
  outputSchema?: unknown;
  annotations?: unknown;
  serverId: string;
  serverName: string;
  sessionId: string;
  deviceId: string;
  localServer: string;
  toolName: string;
};

/**
 * Live device catalog for the authenticated user (Option C — live-first).
 * Queries each device's Durable Object for real-time presence + catalog and
 * EXCLUDES offline devices, so stale/abandoned devices disappear from
 * list/search. KV records are only a cold-start fallback (also TTL'd), never
 * the source of truth for the listing.
 */
async function loadDeviceEntries(): Promise<DeviceToolEntry[]> {
  const context = getRequestContext();
  const userId = context.userId;
  const env = context.env;
  if (!userId || !env) return [];

  let deviceIds: string[];
  try {
    deviceIds = await loadUserDeviceIds(env, userId);
  } catch {
    return [];
  }

  const entries: DeviceToolEntry[] = [];
  for (const deviceId of deviceIds) {
    let status: { servers: ServerInfo[]; online: boolean } | null = null;
    try {
      status = await loadDeviceStatus(env, deviceId);
    } catch {
      status = null;
    }
    // Offline / unreachable → exclude entirely.
    if (!status || !status.online) continue;
    for (const srv of status.servers) {
      const serverId = deviceServerId(deviceId, srv.name);
      for (const [toolName, tool] of Object.entries(srv.tools ?? {})) {
        entries.push({
          name: toolName,
          description: tool.description,
          inputSchema: tool.inputSchema,
          annotations: tool.annotations,
          serverId,
          serverName: srv.name,
          sessionId: deviceId,
          deviceId,
          localServer: srv.name,
          toolName,
        });
      }
    }
  }
  return entries;
}

/** All device tools for the authenticated user (full live catalog). */
export async function listDeviceTools(): Promise<DeviceToolEntry[]> {
  return loadDeviceEntries();
}

/** Device servers for the authenticated user (tool-router view). */
export async function listDeviceServers(): Promise<
  { serverName: string; serverId: string; toolCount: number }[]
> {
  const byServer = new Map<string, number>();
  for (const entry of await loadDeviceEntries()) {
    byServer.set(entry.serverId, (byServer.get(entry.serverId) ?? 0) + 1);
  }
  return [...byServer.entries()].map(([serverId, toolCount]) => ({
    serverName: serverId.replace(/^device:[^:]+:/, ""),
    serverId,
    toolCount,
  }));
}

/** Case-insensitive substring search over device tools. */
export async function searchDeviceTools(
  query: string,
  limit = 5
): Promise<DeviceToolEntry[]> {
  const q = query.trim().toLowerCase();
  const entries = await loadDeviceEntries();
  if (!q) return entries.slice(0, limit);
  const filtered = entries.filter(
    (e) =>
      e.name.toLowerCase().includes(q) ||
      (e.description ?? "").toLowerCase().includes(q) ||
      e.serverName.toLowerCase().includes(q)
  );
  return filtered.slice(0, limit);
}

/** Resolve a single device tool by name (+ optional serverId). */
export async function resolveDeviceToolSchema(
  toolName: string,
  serverId?: string
): Promise<DeviceToolEntry | undefined> {
  const entries = await loadDeviceEntries();
  return entries.find(
    (e) => e.name === toolName && (!serverId || e.serverId === serverId)
  );
}

/** Build CodeMode ToolServer objects so codemode_run can call device tools. */
export async function buildDeviceToolServers(): Promise<
  {
    serverId: string;
    serverName?: string;
    listTools: () => Promise<{ tools: Record<string, unknown>[] }>;
    callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  }[]
> {
  const context = getRequestContext();
  const env = context.env;
  if (!env) return [];

  const byServer = new Map<
    string,
    { deviceId: string; localServer: string; tools: Record<string, unknown>[] }
  >();
  for (const entry of await loadDeviceEntries()) {
    const existing = byServer.get(entry.serverId);
    if (existing) {
      existing.tools.push({
        name: entry.name,
        description: entry.description,
        inputSchema: entry.inputSchema ?? {},
        annotations: entry.annotations,
      });
    } else {
      byServer.set(entry.serverId, {
        deviceId: entry.deviceId,
        localServer: entry.localServer,
        tools: [
          {
            name: entry.name,
            description: entry.description,
            inputSchema: entry.inputSchema ?? {},
            annotations: entry.annotations,
          },
        ],
      });
    }
  }

  return [...byServer.entries()].map(([serverId, meta]) => ({
    serverId,
    serverName: serverId.replace(/^device:[^:]+:/, ""),
    listTools: () => Promise.resolve({ tools: meta.tools }),
    callTool: async (name: string, args: Record<string, unknown>) => {
      try {
        const result = await invokeDevice(
          env,
          meta.deviceId,
          meta.localServer,
          name,
          { arguments: args ?? {} },
        );
        return result;
      } catch (err) {
        return { isError: true, content: [{ type: "text", text: (err as Error).message }] };
      }
    },
  }));
}
