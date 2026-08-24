import { BM25SearchStrategy, type IndexedTool, type ToolSearchResult } from "@mcp-ts/tool-router";
import { connectMcpEndpoint, type McpEndpointClient } from "../client.js";
import { DEFAULT_LOCAL_MCP_PORT, DEFAULT_REMOTE_GATEWAY_URL } from "../constants.js";
import { ensureFreshAuthSession, loadAuthSession, type AuthSession } from "./auth-store.js";
import {
  findProcessOnPort,
  isProcessAlive,
  readGatewayProcess,
  type GatewayProcessInfo,
} from "./daemon.js";
import { pingGateway } from "./context.js";

export type GatewayManagementState = "stopped" | "starting" | "running" | "external" | "occupied" | "unhealthy";

export class AmbiguousToolReferenceError extends Error {
  constructor(toolName: string) {
    super(`Tool name "${toolName}" is ambiguous. Use a canonical server::tool ID.`);
    this.name = "AmbiguousToolReferenceError";
  }
}

export interface GatewayResolution {
  endpoint: string | null;
  port: number;
  state: GatewayManagementState;
  managed: boolean;
  portOwnerPid?: number;
}

export async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

interface GatewayResolverDependencies {
  readPid?: () => GatewayProcessInfo | null;
  isAlive?: (pid: number) => boolean;
  findPortOwner?: (port: number) => number | null;
  probe?: typeof pingGateway;
}

export async function resolveGateway(
  dependencies: GatewayResolverDependencies = {},
): Promise<GatewayResolution> {
  const readPid = dependencies.readPid ?? readGatewayProcess;
  const isAlive = dependencies.isAlive ?? isProcessAlive;
  const findPortOwner = dependencies.findPortOwner ?? findProcessOnPort;
  const probe = dependencies.probe ?? pingGateway;
  const record = readPid();
  const candidates = record?.port && record.port !== DEFAULT_LOCAL_MCP_PORT
    ? [record.port, DEFAULT_LOCAL_MCP_PORT]
    : [record?.port ?? DEFAULT_LOCAL_MCP_PORT];
  let occupied: GatewayResolution | null = null;

  for (const port of candidates) {
    const endpoint = await probe("127.0.0.1", port, "/mcp", 500);
    if (endpoint) {
      const possibleManaged = Boolean(record && record.port === port && isAlive(record.pid));
      if (!possibleManaged) return { endpoint, port, state: "external", managed: false };
      const portOwnerPid = findPortOwner(port) ?? undefined;
      const managed = record!.mode === "daemon" && portOwnerPid === record!.pid;
      return { endpoint, port, state: managed ? "running" : "external", managed, portOwnerPid };
    }
    const portOwnerPid = findPortOwner(port) ?? undefined;
    if (portOwnerPid) {
      occupied ??= { endpoint: null, port, state: "occupied", managed: false, portOwnerPid };
    }
  }

  if (occupied) return occupied;

  return {
    endpoint: null,
    port: record?.port ?? DEFAULT_LOCAL_MCP_PORT,
    state: record && isAlive(record.pid) ? "unhealthy" : "stopped",
    managed: false,
  };
}

interface AuthenticatedRemoteClientDependencies {
  loadSession?: (remoteUrl: string) => AuthSession | null;
  refreshSession?: (remoteUrl: string) => Promise<AuthSession>;
  connect?: typeof connectMcpEndpoint;
  warn?: (message: string) => void;
}

export async function createAuthenticatedRemoteClient(
  remoteUrl = process.env.REMOTE_GATEWAY_URL ?? DEFAULT_REMOTE_GATEWAY_URL,
  dependencies: AuthenticatedRemoteClientDependencies = {},
): Promise<McpEndpointClient | null> {
  const loadSession = dependencies.loadSession ?? loadAuthSession;
  const refreshSession = dependencies.refreshSession ?? ensureFreshAuthSession;
  const connectClient = dependencies.connect ?? connectMcpEndpoint;
  if (!loadSession(remoteUrl)) {
    dependencies.warn?.("Remote tools are unavailable because you are not signed in. Run mcpa login.");
    return null;
  }
  const session = await refreshSession(remoteUrl);
  const endpoint = new URL("/mcp", remoteUrl).toString();
  return connectClient(endpoint, { headers: { Authorization: `Bearer ${session.accessToken}` } });
}

export interface MergeableSearchResult {
  toolId: string;
  serverId: string;
  serverName: string;
  toolName: string;
  name?: string;
  description?: string;
}

export function mergeSearchResults(
  query: string,
  limit: number,
  ...sources: MergeableSearchResult[][]
): Array<MergeableSearchResult & { score: number }> {
  const unique = new Map<string, MergeableSearchResult>();
  for (const result of sources.flat()) {
    const canonical = result.toolId || `${result.serverId}::${result.toolName}`;
    if (!unique.has(canonical)) unique.set(canonical, { ...result, toolId: canonical });
  }
  const indexed: IndexedTool[] = [...unique.values()].map((result) => ({
    serverId: result.serverId,
    serverName: result.serverName,
    toolName: result.toolName,
    description: result.description ?? "",
  }));
  const ranked: ToolSearchResult[] = new BM25SearchStrategy().search(indexed, { query }, limit);
  return ranked.map((rank) => ({
    ...unique.get(rank.toolId)!,
    name: unique.get(rank.toolId)?.name ?? rank.toolName,
    score: rank.score,
  }));
}
