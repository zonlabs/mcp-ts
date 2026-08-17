import { resolveCredentialAndScopes } from "../core/auth";
import type { BridgeSession, BridgeSessionEnv } from "../durable-objects/bridge-session";

export async function handleBridgeConnect(
  request: Request,
  env: Record<string, unknown>,
): Promise<Response> {
  if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
    return new Response("WebSocket upgrade required", { status: 426 });
  }
  const authorization = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  if (!match) return new Response("Unauthorized", { status: 401 });

  const auth = await resolveCredentialAndScopes(match[1]);
  if (!auth) return new Response("Unauthorized", { status: 401 });

  const namespace = (env as unknown as BridgeSessionEnv).BRIDGE_SESSION;
  if (!namespace) return new Response("BRIDGE_SESSION binding not configured", { status: 500 });
  const stub = namespace.get(namespace.idFromName(auth.userId)) as DurableObjectStub<BridgeSession>;

  const headers = new Headers(request.headers);
  headers.delete("authorization");
  headers.set("x-mcpa-user-id", auth.userId);
  return stub.fetch(new Request(request, { headers }));
}
