import { loadEnv } from "../config/env";
import { getRequestContext } from "./request-context";
import {
  withDownstreamToolAnalytics,
  type DownstreamAnalyticsContext,
} from "./instrumentation";

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

type AnalyticsContext = DownstreamAnalyticsContext;

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
  cloudflare?: CloudflareCodeModeRuntimeEnv,
  outboundServers: ToolServer[] = []
): Promise<CodeModeRuntime> {
  const codemode = (await import("@mcp-ts/codemode")) as unknown as CodeModeModuleCompat;
  const env = loadEnv();
  const maxTimeout = env.MCP_SCRIPT_TIMEOUT_MS;

  const cappedLimits = {
    ...limits,
    timeoutMs: limits.timeoutMs !== undefined ? Math.min(limits.timeoutMs, maxTimeout) : maxTimeout,
  };

  // Inbound servers = the user's connected MCP servers (via the SDK client
  // provider). Outbound servers = the user's local-device tools reached over
  // the gateway's outbound WebSocket bridge. Both are callable from the sandbox.
  const inboundServers = codemode.mcpServers?.(provider) ?? [];
  const servers = [...inboundServers, ...outboundServers];
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
    loader: loader as WorkerLoader,
    ...(timeoutMs !== undefined ? { timeout: timeoutMs } : {}),
  });
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
  return withDownstreamToolAnalytics(
    {
      serverId: server.serverId ?? server.getServerId?.(),
      serverName: server.serverName ?? server.getServerName?.(),
      serverUrl: server.serverUrl,
      serverIcons: server.getServerInfo?.()?.icons,
      toolName,
    },
    call,
    analyticsContext,
  );
}
