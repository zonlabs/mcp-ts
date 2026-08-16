import { resolveCredentialAndScopes } from "../core/auth";
import { linkDeviceToUser } from "../device-bridge";

type ConnectEnv = Record<string, unknown> & {
  DEVICE_CONNECTION?: DurableObjectNamespace;
};

/**
 * WebSocket upgrade endpoint for local gateways.
 *
 * Authenticates with a Supabase access token (Bearer header or `token` query
 * param), links the requested device to the authenticated user, then forwards
 * the upgrade into the device's DeviceConnection Durable Object.
 *
 * Implemented as a plain function (not a Hono route) so it can run in the
 * Worker entrypoint before the Hono middleware stack — Hono's `use("*")`
 * middlewares (cors, env copy) interfere with the WebSocket 101 upgrade.
 */
export async function handleConnect(
  request: Request,
  env: Record<string, unknown>,
): Promise<Response> {
  const url = new URL(request.url);
  const deviceId = url.searchParams.get("deviceId") ?? "";
  const queryToken = url.searchParams.get("token") ?? "";
  const authHeader = request.headers.get("authorization") ?? "";
  const token = queryToken || authHeader.replace(/^Bearer\s+/i, "");

  if (!deviceId || !token) {
    return new Response("missing deviceId/token", { status: 401 });
  }

  const auth = await resolveCredentialAndScopes(token);
  if (!auth) {
    return new Response("unauthorized: invalid token", { status: 401 });
  }
  const userId = auth.userId;

  // Bind this device to the authenticated user (idempotent).
  await linkDeviceToUser(env, userId, deviceId);

  const conn = env as ConnectEnv;
  const ns = conn.DEVICE_CONNECTION;
  if (!ns) {
    return new Response("DEVICE_CONNECTION binding not configured", { status: 500 });
  }
  const stub = ns.get(ns.idFromName(deviceId));
  return stub.fetch(request);
}
