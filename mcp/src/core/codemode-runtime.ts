import { loadEnv } from "../config/env";
import { getRequestContext } from "./request-context";
import { recordMcpToolCallEvent } from "./analytics";
import { extractReturnedError } from "./mcp-tool-output";

type ClientProvider = {
  getClients(): unknown[];
};

type CodeModeLimits = {
  timeoutMs?: number;
  memoryLimitMb?: number;
  maxToolCalls?: number;
  maxConcurrentToolCalls?: number;
  maxResultBytes?: number;
  maxLogEntries?: number;
};

type CodeModeRuntime = {
  run: (
    code: string,
    input?: unknown,
    options?: { timeoutMs?: number }
  ) => Promise<{
    value?: unknown;
    logs: unknown[];
    toolCalls: unknown[];
    durationMs: number;
    error?: { code: string; message: string };
  }>;
};

type AnalyticsContext = {
  userId?: string;
  requestId?: string;
  mcpSessionId?: string;
};

type CloudflareCodeModeRuntimeEnv = {
  loader?: unknown;
};

type ToolServer = {
  serverId?: string;
  serverName?: string;
  serverUrl?: string;
  getServerId?: () => string | undefined;
  getServerName?: () => string | undefined;
  getServerInfo?: () => { icons?: { src: string; mimeType?: string; sizes?: string[]; theme?: string }[] } | undefined;
  callTool?: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  callToolRaw?: (name: string, args: Record<string, unknown>) => Promise<unknown>;
};

type CodeModeModuleCompat = {
  createCodeModeRuntime: (options: {
    servers?: unknown[];
    sources?: unknown[];
    limits?: CodeModeLimits;
    runtime?: "quickjs" | "executor" | "isolated-vm";
    executor?: unknown;
  }) => Promise<CodeModeRuntime>;
  mcpServers?: (provider: ClientProvider) => unknown[];
};

export async function createWorkflowCodeModeRuntime(
  provider: ClientProvider,
  limits: CodeModeLimits,
  analyticsContext?: AnalyticsContext,
  cloudflare?: CloudflareCodeModeRuntimeEnv
): Promise<CodeModeRuntime> {
  const codemode = (await import("@mcp-ts/codemode")) as unknown as CodeModeModuleCompat;
  const env = loadEnv();
  const maxTimeout = env.MCP_SCRIPT_TIMEOUT_MS;

  const cappedLimits = {
    ...limits,
    timeoutMs: limits.timeoutMs !== undefined ? Math.min(limits.timeoutMs, maxTimeout) : maxTimeout,
  };

  const servers = codemode.mcpServers?.(provider) ?? [];
  const executor = await createCloudflareCodeModeExecutor(cloudflare?.loader, cappedLimits.timeoutMs);

  return codemode.createCodeModeRuntime({
    servers: wrapToolServersForAnalytics(servers, analyticsContext),
    limits: cappedLimits,
    runtime: "executor",
    executor,
  });
}

async function createCloudflareCodeModeExecutor(loader: unknown, timeoutMs?: number): Promise<unknown> {
  if (!loader) {
    throw new Error("Cloudflare Worker Loader binding is required for CodeMode execution.");
  }

  const { DynamicWorkerExecutor } = await import("@cloudflare/codemode");
  return new DynamicWorkerExecutor({
    loader,
    ...(timeoutMs !== undefined ? { timeout: timeoutMs } : {}),
  });
}

function resolveAnalyticsContext(explicit?: AnalyticsContext): AnalyticsContext {
  const current = getRequestContext();
  return {
    userId: explicit?.userId ?? current.userId,
    requestId: explicit?.requestId ?? current.requestId,
    mcpSessionId: explicit?.mcpSessionId ?? current.mcpSessionId,
  };
}

function wrapToolServersForAnalytics<T>(servers: T[], analyticsContext?: AnalyticsContext): T[] {
  return servers.map((server) => wrapToolServerForAnalytics(server, analyticsContext));
}

function wrapToolServerForAnalytics<T>(server: T, analyticsContext?: AnalyticsContext): T {
  const toolServer = server as T & ToolServer;
  if (typeof toolServer.callTool !== "function" && typeof toolServer.callToolRaw !== "function") {
    return server;
  }

  return new Proxy(toolServer as object, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if ((prop === "callTool" || prop === "callToolRaw") && typeof value === "function") {
        return (toolName: string, args: Record<string, unknown>) =>
          recordToolCall(
            target as ToolServer,
            toolName,
            () => value.call(target, toolName, args),
            analyticsContext
          );
      }
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as T;
}

async function recordToolCall<T>(
  server: ToolServer,
  toolName: string,
  call: () => Promise<T>,
  analyticsContext?: AnalyticsContext
): Promise<T> {
  const context = resolveAnalyticsContext(analyticsContext);
  const startedAt = new Date();
  const startedMs = Date.now();

  try {
    const result = await call();
    const returnedError = extractReturnedError(result);
    recordToolCallEvent(
      context,
      server,
      toolName,
      returnedError ? "error" : "success",
      startedAt,
      Date.now() - startedMs,
      returnedError
    );
    return result;
  } catch (error) {
    recordToolCallEvent(
      context,
      server,
      toolName,
      "error",
      startedAt,
      Date.now() - startedMs,
      error
    );
    throw error;
  }
}

function resolveServerId(server: ToolServer): string | undefined {
  return server.serverId ?? server.getServerId?.();
}

function resolveServerName(server: ToolServer): string | undefined {
  return server.serverName ?? server.getServerName?.();
}

function resolveServerUrl(server: ToolServer): string | undefined {
  return server.serverUrl;
}

function resolveServerIcons(server: ToolServer): { src: string; mimeType?: string; sizes?: string[]; theme?: string }[] | undefined {
  return server.getServerInfo?.()?.icons;
}

function recordToolCallEvent(
  context: AnalyticsContext,
  server: ToolServer,
  toolName: string,
  status: "success" | "error",
  startedAt: Date,
  durationMs: number,
  error?: unknown
): void {
  if (!context.userId?.trim() || !context.requestId?.trim()) {
    return;
  }

  const serverId = resolveServerId(server);
  const task = Promise.resolve(
    recordMcpToolCallEvent({
      userId: context.userId,
      requestId: context.requestId,
      mcpSessionId: context.mcpSessionId,
      serverId,
      serverName: resolveServerName(server),
      serverUrl: resolveServerUrl(server),
      serverIcons: resolveServerIcons(server),
      toolName,
      toolNamespace: serverId,
      eventType: "downstream_tool",
      status,
      error,
      startedAt,
      completedAt: new Date(startedAt.getTime() + Math.max(0, durationMs)),
      durationMs,
    })
  ).catch((recordError) => {
    console.warn("[mcp-analytics] Failed to queue downstream tool call event", recordError);
  });
  getRequestContext().executionCtx?.waitUntil(task);
}
