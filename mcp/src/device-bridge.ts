import { randomUUID } from "node:crypto";
import { DeviceConnection, DEVICE_TTL_SECONDS } from "./device";
import type {
  DeviceRecord,
  ServerInfo,
  UserRecord,
} from "./device";

type BridgeEnv = {
  USERS: KVNamespace;
  DEVICE_CONNECTION: DurableObjectNamespace<DeviceConnection>;
};

function asBridgeEnv(env?: Record<string, unknown>): BridgeEnv {
  return env as unknown as BridgeEnv;
}

/** Ensure user + device records exist, linking the device to the user. */
export async function linkDeviceToUser(
  env: Record<string, unknown>,
  userId: string,
  deviceId: string,
): Promise<void> {
  const e = asBridgeEnv(env);
  const userKey = `user:${userId}`;
  const user = await e.USERS.get<UserRecord>(userKey, "json");
  const userRecord: UserRecord = user ?? {
    userId,
    devices: [],
    createdAt: Date.now(),
  };
  if (!userRecord.devices.includes(deviceId)) {
    userRecord.devices.push(deviceId);
    await e.USERS.put(userKey, JSON.stringify(userRecord));
  }

  const deviceKey = `device:${deviceId}`;
  const device = await e.USERS.get<DeviceRecord>(deviceKey, "json");
  if (!device) {
    const record: DeviceRecord = {
      deviceId,
      userId,
      createdAt: Date.now(),
      servers: [],
    };
    await e.USERS.put(deviceKey, JSON.stringify(record), {
      expirationTtl: DEVICE_TTL_SECONDS,
    });
  }
}

/** deviceIds belonging to a user. */
export async function loadUserDeviceIds(
  env: Record<string, unknown>,
  userId: string,
): Promise<string[]> {
  const e = asBridgeEnv(env);
  const user = await e.USERS.get<UserRecord>(`user:${userId}`, "json");
  return user?.devices ?? [];
}

/** Live presence + catalog for a device from its Durable Object. */
export async function loadDeviceStatus(
  env: Record<string, unknown>,
  deviceId: string,
): Promise<{ servers: ServerInfo[]; online: boolean } | null> {
  const e = asBridgeEnv(env);
  try {
    const stub = e.DEVICE_CONNECTION.get(e.DEVICE_CONNECTION.idFromName(deviceId));
    return await stub.getStatus();
  } catch {
    return null;
  }
}

/** Registered server catalog for a device (KV, falling back to live DO). */
export async function loadServers(
  env: Record<string, unknown>,
  deviceId: string,
): Promise<ServerInfo[]> {
  const e = asBridgeEnv(env);
  const record = await e.USERS.get<DeviceRecord>(`device:${deviceId}`, "json");
  if (record?.servers?.length) return record.servers;
  try {
    const stub = e.DEVICE_CONNECTION.get(e.DEVICE_CONNECTION.idFromName(deviceId));
    return await stub.getServers();
  } catch {
    return [];
  }
}

/** Relay a tool call to the device's local gateway over its live WebSocket. */
export async function invokeDevice(
  env: Record<string, unknown>,
  deviceId: string,
  mcpServer: string,
  tool: string,
  payload: unknown,
): Promise<Record<string, unknown>> {
  const e = asBridgeEnv(env);
  const stub = e.DEVICE_CONNECTION.get(e.DEVICE_CONNECTION.idFromName(deviceId));
  return stub.invoke({
    requestId: randomUUID(),
    mcp_server: mcpServer,
    tool,
    payload,
  });
}
