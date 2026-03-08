import { normalizeCapabilities, normalizeGatewayServerInfo, type GatewayServerInfo, type RemoteAgent } from "@/lib/gateway-access";

const REMOTE_PROXY_BASE_URL = (process.env.REMOTE_PROXY_BASE_URL || "https://hub.linkos.in/agent").replace(/\/+$/, "");
const DEFAULT_TIMEOUT_SECONDS = Math.max(1, Math.min(60, Number(process.env.REMOTE_PROXY_TIMEOUT_SECONDS || "15")));

function jsonHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

async function fetchJsonWithTimeout(url: string, init: RequestInit, timeoutSeconds = DEFAULT_TIMEOUT_SECONDS): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutSeconds * 1000);
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
  const response = (await fetchJsonWithTimeout(
    `${REMOTE_PROXY_BASE_URL}/manage/agents/details?subject=${encodeURIComponent(subject)}`,
    { method: "GET", headers: jsonHeaders() }
  )) as Record<string, unknown>;
  return Array.isArray(response?.agents) ? (response.agents as RemoteAgent[]) : [];
}

export async function getRemoteServerInfo(subject: string, agentId: string, mcpServer: string): Promise<GatewayServerInfo> {
  const data = await fetchJsonWithTimeout(
    `${REMOTE_PROXY_BASE_URL}/manage/${encodeURIComponent(agentId)}/${encodeURIComponent(mcpServer)}/server-info?subject=${encodeURIComponent(subject)}`,
    { method: "POST", headers: jsonHeaders(), body: "{}" }
  );
  return normalizeGatewayServerInfo(data, agentId, mcpServer);
}

export async function invokeRemoteServer(agentId: string, mcpServer: string, payload: unknown, timeoutSeconds = Math.max(DEFAULT_TIMEOUT_SECONDS, 120)): Promise<unknown> {
  return fetchJsonWithTimeout(
    `${REMOTE_PROXY_BASE_URL}/${encodeURIComponent(agentId)}/${encodeURIComponent(mcpServer)}/mcp`,
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
