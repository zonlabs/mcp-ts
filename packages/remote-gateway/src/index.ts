import { WorkerEntrypoint } from "cloudflare:workers";
import OAuthProvider, {
  AuthorizationError,
  getOAuthApi,
  type AuthRequest,
  type OAuthProviderOptions,
} from "@cloudflare/workers-oauth-provider";
import { createMcpHandler, McpServer, fromJsonSchema } from "@modelcontextprotocol/server";
import type { CallToolResult } from "@modelcontextprotocol/client";
import { DeviceConnection } from "./device.js";
import type {
  AuthProps,
  DeviceRecord,
  ServerInfo,
  UserRecord,
} from "./shared.js";
export { DeviceConnection };

export interface Env {
  OAUTH_KV: KVNamespace;
  /** User- and device-keyed namespace. */
  USERS: KVNamespace;
  DEVICE_CONNECTION: DurableObjectNamespace<DeviceConnection>;
  /** Supabase project URL, e.g. https://xyz.supabase.co */
  SUPABASE_URL?: string;
  /** Supabase anon (publishable) key. */
  SUPABASE_ANON_KEY?: string;
  /** Host of the login app (mcp-client / MCP Assistant). */
  LOGIN_BASE_URL?: string;
  /** Clean public MCP URL, e.g. https://linkos.in/mcp */
  PUBLIC_MCP_URL?: string;
}

const RESOURCE = "https://linkos.in/mcp";
/** Route on the login app that completes the browser sign-in and bounces back. */
const LOGIN_BOUNCE_PATH = "/linkos/oauth";

/* ------------------------------------------------------------------ */
/* API handler: serves the MCP endpoint for an authenticated grant.    */
/* ------------------------------------------------------------------ */

class McpApiHandler extends WorkerEntrypoint<Env> {
  private mcpHandler = createMcpHandler(async (ctx) => {
    const authInfo = ctx.authInfo;
    const props = (authInfo?.extra ?? {}) as unknown as AuthProps;
    const mcp = new McpServer(
      { name: "linkos.in MCP gateway", version: "0.1.0" },
      { capabilities: { tools: {} } },
    );

    const userId = props.userId;
    const deviceIds = props.deviceId
      ? [props.deviceId]
      : await this.loadUserDeviceIds(userId);

    const registered = new Map<
      string,
      { deviceId: string; server: string; tool: string }
    >();

    for (const deviceId of deviceIds) {
      const servers = await this.loadServers(deviceId);
      for (const server of servers) {
        for (const toolName of Object.keys(server.tools ?? {})) {
          const tool = server.tools[toolName]!;
          let exposed = toolName;
          if (registered.has(exposed)) exposed = `${server.name}:${toolName}`;
          if (registered.has(exposed)) {
            exposed = `${deviceId.slice(0, 8)}:${server.name}:${toolName}`;
          }
          let i = 2;
          while (registered.has(exposed)) exposed = `${exposed}#${i++}`;
          registered.set(exposed, { deviceId, server: server.name, tool: toolName });

          mcp.registerTool(
            exposed,
            {
              description: tool.description,
              inputSchema: fromJsonSchema(tool.inputSchema as never),
            },
            async (args) => {
              const entry = registered.get(exposed)!;
              const result = await this.invokeDevice(
                entry.deviceId,
                entry.server,
                entry.tool,
                { arguments: args ?? {} },
              );
              return result as unknown as CallToolResult;
            },
          );
        }
      }
    }
    return mcp;
  });

  private async loadUserDeviceIds(userId: string): Promise<string[]> {
    const user = await this.env.USERS.get<UserRecord>(`user:${userId}`, "json");
    return user?.devices ?? [];
  }

  private async loadServers(deviceId: string): Promise<ServerInfo[]> {
    const record = await this.env.USERS.get<DeviceRecord>(`device:${deviceId}`, "json");
    if (record?.servers?.length) return record.servers;
    // Fall back to the live DO catalog.
    try {
      const stub = this.env.DEVICE_CONNECTION.get(
        this.env.DEVICE_CONNECTION.idFromName(deviceId),
      );
      return await stub.getServers();
    } catch {
      return [];
    }
  }

  private async invokeDevice(
    deviceId: string,
    mcpServer: string,
    tool: string,
    payload: unknown,
  ): Promise<Record<string, unknown>> {
    const stub = this.env.DEVICE_CONNECTION.get(
      this.env.DEVICE_CONNECTION.idFromName(deviceId),
    );
    return stub.invoke({
      requestId: crypto.randomUUID(),
      mcp_server: mcpServer,
      tool,
      payload,
    });
  }

  override async fetch(request: Request): Promise<Response> {
    const props = (this.ctx as unknown as { props?: AuthProps }).props ?? {};
    return this.mcpHandler.fetch(request, {
      authInfo: {
        token: "",
        clientId: "",
        scopes: [],
        extra: props,
      },
    });
  }
}

/* ------------------------------------------------------------------ */
/* Default handler: /authorize (login-app redirect), /connect (WS).    */
/* ------------------------------------------------------------------ */

/** Validate a Supabase access token via GoTrue and return the user id. */
async function validateSupabaseToken(
  env: Env,
  token: string,
): Promise<{ userId: string }> {
  if (
    !env.SUPABASE_URL ||
    !env.SUPABASE_ANON_KEY ||
    env.SUPABASE_URL.includes("REPLACE_WITH") ||
    env.SUPABASE_ANON_KEY.includes("REPLACE_WITH")
  ) {
    // Dev fallback: deterministic user derived from the token.
    return { userId: `user_${(await sha256(token)).slice(0, 20)}` };
  }
  const res = await fetch(
    `${env.SUPABASE_URL.replace(/\/$/, "")}/auth/v1/user`,
    {
      headers: {
        apikey: env.SUPABASE_ANON_KEY,
        authorization: `Bearer ${token}`,
      },
    },
  );
  if (!res.ok) {
    throw new Error(`Supabase session validation failed: ${res.status}`);
  }
  const body = (await res.json()) as { id?: string; error?: string };
  if (!body.id) {
    throw new Error(body.error ?? "Supabase returned no user");
  }
  return { userId: body.id };
}

/** Ensure user + device records exist, linking the device to the user. */
async function linkDeviceToUser(
  env: Env,
  userId: string,
  deviceId: string,
): Promise<void> {
  const userKey = `user:${userId}`;
  const user = await env.USERS.get<UserRecord>(userKey, "json");
  const userRecord: UserRecord = user ?? {
    userId,
    devices: [],
    createdAt: Date.now(),
  };
  if (!userRecord.devices.includes(deviceId)) {
    userRecord.devices.push(deviceId);
    await env.USERS.put(userKey, JSON.stringify(userRecord));
  }

  const deviceKey = `device:${deviceId}`;
  const device = await env.USERS.get<DeviceRecord>(deviceKey, "json");
  if (!device) {
    const record: DeviceRecord = {
      deviceId,
      userId,
      createdAt: Date.now(),
      servers: [],
    };
    await env.USERS.put(deviceKey, JSON.stringify(record));
  }
}

async function handleAuthorize(request: Request, env: Env): Promise<Response> {
  const oauth = getOAuthApi(options, env);
  const url = new URL(request.url);
  const deviceId = url.searchParams.get("device_id") ?? "";
  const supabaseToken = url.searchParams.get("supabase_token") ?? "";

  let authRequest: AuthRequest;
  try {
    authRequest = await oauth.parseAuthRequest(request);
  } catch (err) {
    const error = err as AuthorizationError;
    if (!error.redirectUri) {
      return Response.json(
        { error: error.code, error_description: error.description },
        { status: 400 },
      );
    }
    const u = new URL(error.redirectUri);
    u.searchParams.set("error", error.code);
    u.searchParams.set("error_description", error.description);
    if (error.state) u.searchParams.set("state", error.state);
    return Response.redirect(u.toString(), 302);
  }

  // No session yet → send the browser to the login app (mcp-client sign-in).
  if (!supabaseToken) {
    const loginBase = (env.LOGIN_BASE_URL ?? "https://mcp-assistant.in").replace(
      /\/$/,
      "",
    );
    const bounce = new URL(LOGIN_BOUNCE_PATH, loginBase);
    bounce.searchParams.set("next", request.url);
    return Response.redirect(bounce.toString(), 302);
  }

  let userId: string;
  try {
    const auth = await validateSupabaseToken(env, supabaseToken);
    userId = auth.userId;
  } catch (err) {
    return renderErrorPage(`Sign-in verification failed: ${(err as Error).message}`);
  }

  // Link a device if one was requested during enrollment.
  if (deviceId) {
    await linkDeviceToUser(env, userId, deviceId);
  }

  const props: AuthProps = { userId };
  if (deviceId) props.deviceId = deviceId;
  const { redirectTo } = await oauth.completeAuthorization({
    request: authRequest,
    userId,
    metadata: { deviceId: deviceId || undefined },
    scope: authRequest.scope,
    props,
  });
  return Response.redirect(redirectTo, 302);
}

async function renderErrorPage(message: string): Promise<Response> {
  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>linkos.in MCP — Error</title>
<style>
body{font-family:system-ui,sans-serif;max-width:480px;margin:40px auto;padding:0 16px;color:#111}
.error{color:#d00;margin-top:10px}
</style></head>
<body>
<h1>Sign-in failed</h1>
<div class="error">${message}</div>
<p><a href="/">Try again</a></p>
</body>
</html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}

async function handleConnect(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const deviceId = url.searchParams.get("deviceId") ?? "";
  const token = url.searchParams.get("token") ?? "";
  if (!deviceId || !token) {
    return new Response("missing deviceId/token", { status: 401 });
  }

  // Validate the user-bound OAuth token and confirm it belongs to this device.
  const oauth = getOAuthApi(options, env);
  const summary = await oauth.unwrapToken(token);
  if (!summary) {
    return new Response("unauthorized: invalid token", { status: 401 });
  }
  const props = (summary.grant?.props ?? {}) as AuthProps;
  if (props.userId && props.deviceId && props.deviceId !== deviceId) {
    return new Response("unauthorized: token not bound to device", { status: 401 });
  }

  const stub = env.DEVICE_CONNECTION.get(env.DEVICE_CONNECTION.idFromName(deviceId));
  return stub.fetch(request);
}

const defaultHandler: OAuthProviderOptions<Env>["defaultHandler"] = {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    switch (url.pathname) {
      case "/healthz":
        return Response.json({ ok: true });
      case "/authorize":
        return handleAuthorize(request, env);
      case "/connect":
        return handleConnect(request, env);
      default:
        return new Response("Not found", { status: 404 });
    }
  },
};

/* ------------------------------------------------------------------ */
/* Provider wiring                                                      */
/* ------------------------------------------------------------------ */

const options: OAuthProviderOptions<Env> = {
  apiRoute: "/mcp",
  apiHandler: McpApiHandler,
  defaultHandler,
  authorizeEndpoint: "/authorize",
  tokenEndpoint: "/oauth/token",
  clientRegistrationEndpoint: "/oauth/register",
  resourceMetadata: {
    resource_name: "linkos.in MCP gateway",
  },
};

export default new OAuthProvider<Env>(options);

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

async function sha256(value: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
