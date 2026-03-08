export interface GatewayServerSelection {
  agentId: string;
  mcpServer: string;
}

export interface GatewayToolInfo {
  name: string;
  description?: string;
  inputSchema?: unknown;
  parameters?: unknown;
  [key: string]: unknown;
}

export interface GatewayServerInfo {
  status: "connected" | "error";
  agent_id: string;
  mcp_server: string;
  title: string;
  version: string;
  instructions: string;
  tools_count: number;
  tools: GatewayToolInfo[];
}

export interface RemoteAgent {
  subject?: string;
  capabilities?: string[];
}

export const GATEWAY_SELECTIONS_STORAGE_KEY = "mcp-assistant:gateway-selections:v1";

export function normalizeAgentId(agent: RemoteAgent): string {
  return String(agent.subject || "").trim();
}

export function normalizeCapabilities(agent: RemoteAgent): string[] {
  const raw = Array.isArray(agent.capabilities) ? agent.capabilities : [];
  return raw.map((value) => String(value || "").trim()).filter(Boolean);
}

export function normalizeGatewayServerInfo(raw: unknown, agentId: string, mcpServer: string): GatewayServerInfo {
  const data = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const nestedTools = data.tools;
  const toolsArray = Array.isArray(nestedTools)
    ? nestedTools
    : (nestedTools && typeof nestedTools === "object" && Array.isArray((nestedTools as Record<string, unknown>).tools))
      ? ((nestedTools as Record<string, unknown>).tools as unknown[])
      : [];

  const tools = toolsArray
    .map((tool) => (tool && typeof tool === "object" ? (tool as GatewayToolInfo) : null))
    .filter((tool): tool is GatewayToolInfo => Boolean(tool));

  return {
    status: data.status === "error" ? "error" : "connected",
    agent_id: String(data.agent_id || agentId || ""),
    mcp_server: String(data.mcp_server || mcpServer || ""),
    title: String(data.title || ""),
    version: String(data.version || ""),
    instructions: String(data.instructions || ""),
    tools_count: Number.isFinite(Number(data.tools_count)) ? Number(data.tools_count) : tools.length,
    tools,
  };
}

function normalizeSelection(input: unknown): GatewayServerSelection | null {
  if (!input || typeof input !== "object") return null;
  const value = input as Record<string, unknown>;
  const agentId = String(value.agentId || "").trim();
  const mcpServer = String(value.mcpServer || "").trim();
  if (!agentId || !mcpServer) return null;
  return { agentId, mcpServer };
}

export function readGatewaySelectionsFromStorage(): GatewayServerSelection[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(GATEWAY_SELECTIONS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeSelection).filter((item): item is GatewayServerSelection => Boolean(item));
  } catch {
    return [];
  }
}

export function writeGatewaySelectionsToStorage(selections: GatewayServerSelection[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(GATEWAY_SELECTIONS_STORAGE_KEY, JSON.stringify(selections));
}

export function selectionKey(selection: GatewayServerSelection): string {
  return `${selection.agentId}::${selection.mcpServer}`;
}
