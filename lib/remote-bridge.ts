import { normalizeCapabilities, normalizeGatewayServerInfo, type GatewayServerInfo, type RemoteAgent } from "@/lib/gateway-access";

const REMOTE_PROXY_BASE_URL = (process.env.REMOTE_PROXY_BASE_URL || "").replace(/\/+$/, "");
const DEFAULT_TIMEOUT_SECONDS = Math.max(1, Math.min(60, Number(process.env.REMOTE_PROXY_TIMEOUT_SECONDS || "15")));

export function requireRemoteProxyBaseUrl(): string {
  if (!REMOTE_PROXY_BASE_URL) {
    throw new Error(
      "REMOTE_PROXY_BASE_URL is not set. Set it to your gateway base URL (example: https://gateway.example.com/agent)."
    );
  }
  return REMOTE_PROXY_BASE_URL;
}

function jsonHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

function enhanceFetchError(error: unknown, url: string): Error {
  if (error instanceof Error) {
    const name = error.name ? `${error.name}: ` : "";
    return new Error(`Remote gateway fetch failed: ${name}${error.message}\nRequest URL: ${url}`);
  }
  return new Error(`Remote gateway fetch failed.\nRequest URL: ${url}`);
}

async function fetchJsonWithTimeout(url: string, init: RequestInit, timeoutSeconds = DEFAULT_TIMEOUT_SECONDS): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutSeconds * 1000);
  try {
    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
        cache: "no-store",
      });
      const text = await response.text();
      if (!response.ok) {
        throw new Error(text || `${response.status} ${response.statusText}`);
      }
      return text ? JSON.parse(text) : {};
    } catch (error) {
      throw enhanceFetchError(error, url);
    }
  } finally {
    clearTimeout(timeout);
  }
}

export function getBridgeSubjectFromUserId(userId: string): string {
  const subject = String(userId || "").slice(-10);
  if (!subject) {
    throw new Error("Unauthorized");
  }
  return subject;
}

export async function getRemoteAgents(subject: string): Promise<RemoteAgent[]> {
  const baseUrl = requireRemoteProxyBaseUrl();
  const response = (await fetchJsonWithTimeout(
    `${baseUrl}/manage/agents/details?subject=${encodeURIComponent(subject)}`,
    { method: "GET", headers: jsonHeaders() }
  )) as Record<string, unknown>;
  return Array.isArray(response?.agents) ? (response.agents as RemoteAgent[]) : [];
}

export async function getRemoteServerInfo(subject: string, agentId: string, mcpServer: string): Promise<GatewayServerInfo> {
  const baseUrl = requireRemoteProxyBaseUrl();
  const data = await fetchJsonWithTimeout(
    `${baseUrl}/manage/${encodeURIComponent(agentId)}/${encodeURIComponent(mcpServer)}/server-info?subject=${encodeURIComponent(subject)}`,
    { method: "POST", headers: jsonHeaders(), body: "{}" }
  );
  return normalizeGatewayServerInfo(data, agentId, mcpServer);
}

export async function invokeRemoteServer(agentId: string, mcpServer: string, payload: unknown, timeoutSeconds = Math.max(DEFAULT_TIMEOUT_SECONDS, 120)): Promise<unknown> {
  const baseUrl = requireRemoteProxyBaseUrl();
  return fetchJsonWithTimeout(
    `${baseUrl}/${encodeURIComponent(agentId)}/${encodeURIComponent(mcpServer)}/mcp`,
    {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify(payload ?? {}),
    },
    timeoutSeconds
  );
}

export function collectAgentServerPairs(agents: RemoteAgent[]): Set<string> {
  const allowed = new Set<string>();
  for (const agent of agents) {
    const agentId = String(agent.subject || "").trim();
    if (!agentId) continue;
    for (const mcpServer of normalizeCapabilities(agent)) {
      allowed.add(`${agentId}::${mcpServer}`);
    }
  }
  return allowed;
}
