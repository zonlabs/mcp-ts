export type ToolApprovalMode = "always" | "risky" | "never";

export interface UserPreferences {
  timezone: string;
  toolApprovalMode: ToolApprovalMode;
}

export const USER_PREFERENCES_STORAGE_KEY = "mcp-assistant:user-preferences:v1";

export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  timezone: "Asia/Kolkata",
  toolApprovalMode: "always",
};

const TOOL_APPROVAL_MODES = new Set<ToolApprovalMode>(["always", "risky", "never"]);

export function getDefaultUserPreferences(): UserPreferences {
  return { ...DEFAULT_USER_PREFERENCES };
}

export function normalizeUserPreferences(input: Partial<UserPreferences> | null | undefined): UserPreferences {
  const defaults = getDefaultUserPreferences();
  const rawMode = input?.toolApprovalMode;
  const toolApprovalMode = rawMode && TOOL_APPROVAL_MODES.has(rawMode)
    ? rawMode
    : defaults.toolApprovalMode;

  return {
    timezone: input?.timezone?.trim() || defaults.timezone,
    toolApprovalMode,
  };
}

export function readUserPreferencesFromStorage(): UserPreferences {
  if (typeof window === "undefined") return getDefaultUserPreferences();

  const stored = localStorage.getItem(USER_PREFERENCES_STORAGE_KEY);
  if (!stored) return getDefaultUserPreferences();

  try {
    return normalizeUserPreferences(JSON.parse(stored));
  } catch {
    return getDefaultUserPreferences();
  }
}

export function writeUserPreferencesToStorage(preferences: UserPreferences) {
  if (typeof window === "undefined") return;
  localStorage.setItem(
    USER_PREFERENCES_STORAGE_KEY,
    JSON.stringify(normalizeUserPreferences(preferences))
  );
}

export function shouldRequireMcpToolApproval(
  preferences: Pick<UserPreferences, "toolApprovalMode">
): boolean {
  if (preferences.toolApprovalMode === "never") return false;
  return true;
}

export function describeToolApprovalMode(mode: ToolApprovalMode): string {
  if (mode === "never") return "Run MCP tools without asking.";
  if (mode === "risky") return "Ask before MCP tool execution until risk hints are available.";
  return "Ask before every MCP tool execution.";
}
