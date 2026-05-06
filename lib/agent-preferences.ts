export type ToolApprovalMode = "always" | "risky" | "never";

export interface AgentPreferences {
  timezone: string;
  language: string;
  toolApprovalMode: ToolApprovalMode;
}

export const AGENT_PREFERENCES_STORAGE_KEY = "mcp-assistant:agent-preferences:v1";

export const DEFAULT_AGENT_PREFERENCES: AgentPreferences = {
  timezone: "Asia/Kolkata",
  language: "en-US",
  toolApprovalMode: "always",
};

const TOOL_APPROVAL_MODES = new Set<ToolApprovalMode>(["always", "risky", "never"]);

function browserLanguage(): string {
  if (typeof navigator === "undefined") return DEFAULT_AGENT_PREFERENCES.language;
  return navigator.language || DEFAULT_AGENT_PREFERENCES.language;
}

export function getDefaultAgentPreferences(): AgentPreferences {
  if (typeof window === "undefined") return { ...DEFAULT_AGENT_PREFERENCES };
  return {
    ...DEFAULT_AGENT_PREFERENCES,
    language: browserLanguage(),
  };
}

export function normalizeAgentPreferences(input: Partial<AgentPreferences> | null | undefined): AgentPreferences {
  const defaults = getDefaultAgentPreferences();
  const rawMode = input?.toolApprovalMode;
  const toolApprovalMode = rawMode && TOOL_APPROVAL_MODES.has(rawMode)
    ? rawMode
    : defaults.toolApprovalMode;

  return {
    timezone: input?.timezone?.trim() || defaults.timezone,
    language: input?.language?.trim() || defaults.language,
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
