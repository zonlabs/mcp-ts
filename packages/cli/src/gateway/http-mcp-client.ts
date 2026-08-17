import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { join } from "node:path";
import {
  FileStorageBackend,
  McpClient,
  type McpClientOptions,
  type SessionStore,
} from "@mcp-ts/client";
import type { Tool } from "@modelcontextprotocol/client";
import { authConfigDir } from "./auth-store.js";
import { pc, treeNote } from "../ux.js";
import {
  HTTP_CLIENT_CALLBACK_PORT,
  HTTP_CLIENT_CALLBACK_PATH,
  CLI_USER_ID,
} from "../constants.js";

interface OAuthCallback {
  code: string;
  state?: string;
  iss?: string;
}

interface OAuthMcpClient {
  connect(): Promise<void>;
  finishAuth(code: string, state?: string, iss?: string): Promise<void>;
  listTools(): Promise<{ tools: Tool[] }>;
  callTool(toolName: string, args: Record<string, unknown>): Promise<unknown>;
  disconnect(): Promise<void>;
}

type Authorize = (authorizationUrl: string, callbackUrl: string) => Promise<OAuthCallback>;
type CreateClient = (options: McpClientOptions) => OAuthMcpClient;

export interface ConnectHttpMcpServerOptions {
  serverId: string;
  serverName: string;
  headers?: Record<string, string>;
  transport?: "sse" | "streamable-http";
  sessionStore?: SessionStore;
  createClient?: CreateClient;
  authorize?: Authorize;
  onProgress?: (message: string) => void;
}

export interface HttpMcpConnection {
  listTools(): Promise<{ tools: Tool[] }>;
  callTool(toolName: string, args: Record<string, unknown>): Promise<unknown>;
  close(): Promise<void>;
  getServerId(): string;
  getServerName(): string;
  getServerUrl(): string;
}

let sessionStorePromise: Promise<SessionStore> | null = null;

function defaultSessionStore(): Promise<SessionStore> {
  if (!sessionStorePromise) {
    sessionStorePromise = (async () => {
      const store = new FileStorageBackend({ path: join(authConfigDir(), "mcp-sessions.json") });
      await store.init?.();
      return store;
    })();
  }
  return sessionStorePromise;
}

function deriveSessionId(endpoint: string): string {
  const normalized = new URL(endpoint).toString();
  return `cli_${createHash("sha256").update(normalized).digest("hex").slice(0, 24)}`;
}

export interface DisconnectHttpMcpServerOptions {
  serverId?: string;
  serverName?: string;
  sessionStore?: SessionStore;
}
// TODO: improvement opportunity (see if the McpClient is already created in memory else directly remove the from storage api)
export async function disconnectHttpMcpServer(
  endpointOrName: string,
  options: DisconnectHttpMcpServerOptions = {},
): Promise<{ disconnected: boolean; sessionId?: string }> {
  try {
    const sessionStore = options.sessionStore ?? await defaultSessionStore();

    let targetUrl: string | undefined;
    let targetSessionId: string | undefined;

    try {
      const url = new URL(endpointOrName);
      if (url.protocol === "http:" || url.protocol === "https:") {
        targetUrl = url.toString();
        targetSessionId = deriveSessionId(targetUrl);
      }
    } catch {
      // endpointOrName is a serverId or serverName
    }

    const allSessions = await sessionStore.list(CLI_USER_ID);
    const matchingSessions = allSessions.filter((s) => {
      if (targetSessionId && s.sessionId === targetSessionId) return true;
      if (targetUrl && s.serverUrl === targetUrl) return true;
      if (options.serverId && s.serverId === options.serverId) return true;
      if (s.serverId === endpointOrName || s.serverName === endpointOrName) return true;
      return false;
    });

    let anyDisconnected = false;

    if (matchingSessions.length > 0) {
      await Promise.allSettled(
        matchingSessions.map(async (session) => {
          try {
            const client = new McpClient({
              userId: CLI_USER_ID,
              sessionId: session.sessionId,
              serverId: session.serverId,
              serverUrl: session.serverUrl,
              callbackUrl: session.callbackUrl,
              serverName: session.serverName,
              transport: session.serverOptions?.transport,
              headers: session.headers,
              hasSession: true,
              sessionStore,
            });

            await client.disconnect().catch(() => undefined);
            client.dispose?.();
          } finally {
            await sessionStore.delete(CLI_USER_ID, session.sessionId);
          }
        }),
      );
      anyDisconnected = true;
    }

    if (targetSessionId && !anyDisconnected) {
      await sessionStore.delete(CLI_USER_ID, targetSessionId).catch(() => undefined);
      anyDisconnected = true;
    }

    return {
      disconnected: anyDisconnected,
      sessionId: targetSessionId ?? matchingSessions[0]?.sessionId,
    };
  } catch {
    return { disconnected: false };
  }
}

function openBrowser(url: string): void {
  if (process.platform === "win32") {
    execFile("rundll32", ["url.dll,FileProtocolHandler", url]);
  } else if (process.platform === "darwin") {
    execFile("open", [url]);
  } else {
    execFile("xdg-open", [url]);
  }
}

function authorizeInBrowser(authorizationUrl: string, callbackUrl: string): Promise<OAuthCallback> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      server.close(callback);
    };
    const server = createServer((request, response) => {
      const url = new URL(request.url ?? "/", callbackUrl);
      if (url.pathname !== HTTP_CLIENT_CALLBACK_PATH) {
        response.writeHead(404).end("Not found");
        return;
      }
      const error = url.searchParams.get("error");
      const code = url.searchParams.get("code");
      if (error || !code) {
        response.writeHead(400, { "content-type": "text/html; charset=utf-8" });
        response.end("<!doctype html><title>MCP authorization failed</title><p>Authorization was not completed.</p>");
        finish(() => reject(new Error(error ?? "OAuth callback did not include an authorization code")));
        return;
      }
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end("<!doctype html><title>MCP authorized</title><p>Authorization received. You can close this tab.</p>");
      finish(() => resolve({
        code,
        state: url.searchParams.get("state") ?? undefined,
        iss: url.searchParams.get("iss") ?? undefined,
      }));
    });
    const timeout = setTimeout(() => {
      finish(() => reject(new Error("Timed out waiting for MCP OAuth authorization")));
    }, 5 * 60_000);
    timeout.unref?.();
    server.once("error", (error) => finish(() => reject(error)));
    const callback = new URL(callbackUrl);
    server.listen(Number(callback.port), callback.hostname, () => openBrowser(authorizationUrl));
  });
}

export async function connectHttpMcpServer(
  endpoint: string,
  options: ConnectHttpMcpServerOptions,
): Promise<HttpMcpConnection> {
  const url = new URL(endpoint);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("MCP endpoint must use http:// or https://");
  }

  const callbackUrl = `http://127.0.0.1:${HTTP_CLIENT_CALLBACK_PORT}${HTTP_CLIENT_CALLBACK_PATH}`;
  const sessionStore = options.sessionStore ?? await defaultSessionStore();
  let authorizationUrl: string | undefined;
  const client = (options.createClient ?? ((config) => new McpClient(config) as OAuthMcpClient))({
    userId: CLI_USER_ID,
    sessionId: deriveSessionId(url.toString()),
    serverId: options.serverId,
    serverName: options.serverName,
    serverUrl: url.toString(),
    callbackUrl,
    headers: options.headers,
    transport: options.transport ? { type: options.transport } : undefined,
    sessionStore,
    onRedirect: (redirectUrl) => {
      authorizationUrl = redirectUrl;
    },
  });

  try {
    await client.connect();
  } catch (error) {
    if (!authorizationUrl) {
      await client.disconnect().catch(() => undefined);
      throw error;
    }
    try {
      options.onProgress?.("browser_opened");
      const callback = await (options.authorize ?? authorizeInBrowser)(authorizationUrl, callbackUrl);
      options.onProgress?.("code_exchanged");
      await client.finishAuth(callback.code, callback.state, callback.iss);
    } catch (authorizationError) {
      await client.disconnect().catch(() => undefined);
      throw authorizationError;
    }
  }

  return {
    listTools: () => client.listTools(),
    callTool: (toolName, args) => client.callTool(toolName, args),
    close: () => client.disconnect(),
    getServerId: () => options.serverId,
    getServerName: () => options.serverName,
    getServerUrl: () => url.toString(),
  };
}
