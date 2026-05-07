export type ToolApprovalMode = "always" | "risky" | "never";

export interface AgentPreferences {
  timezone: string;
  toolApprovalMode: ToolApprovalMode;
}

export const AGENT_PREFERENCES_STORAGE_KEY = "mcp-assistant:agent-preferences:v1";

export const DEFAULT_AGENT_PREFERENCES: AgentPreferences = {
  timezone: "Asia/Kolkata",
  toolApprovalMode: "always",
};

const TOOL_APPROVAL_MODES = new Set<ToolApprovalMode>(["always", "risky", "never"]);

export function getDefaultAgentPreferences(): AgentPreferences {
  return { ...DEFAULT_AGENT_PREFERENCES };
}

export function normalizeAgentPreferences(input: Partial<AgentPreferences> | null | undefined): AgentPreferences {
  const defaults = getDefaultAgentPreferences();
  const rawMode = input?.toolApprovalMode;
  const toolApprovalMode = rawMode && TOOL_APPROVAL_MODES.has(rawMode)
    ? rawMode
    : defaults.toolApprovalMode;

  return {
    timezone: input?.timezone?.trim() || defaults.timezone,
    toolApprovalMode,
  };
}

export function readAgentPreferencesFromStorage(): AgentPreferences {
  if (typeof window === "undefined") return getDefaultAgentPreferences();

  const stored = localStorage.getItem(AGENT_PREFERENCES_STORAGE_KEY);
  if (!stored) return getDefaultAgentPreferences();

  try {
    return normalizeAgentPreferences(JSON.parse(stored));
  } catch {
    return getDefaultAgentPreferences();
  }
}

export function writeAgentPreferencesToStorage(preferences: AgentPreferences) {
  if (typeof window === "undefined") return;
  localStorage.setItem(
    AGENT_PREFERENCES_STORAGE_KEY,
    JSON.stringify(normalizeAgentPreferences(preferences))
  );
}

export function shouldRequireMcpToolApproval(
  preferences: Pick<AgentPreferences, "toolApprovalMode">
): boolean {
  if (preferences.toolApprovalMode === "never") return false;
  return true;
}

export function describeToolApprovalMode(mode: ToolApprovalMode): string {
  if (mode === "never") return "Run MCP tools without asking.";
  if (mode === "risky") return "Ask before MCP tool execution until risk hints are available.";
  return "Ask before every MCP tool execution.";
}
