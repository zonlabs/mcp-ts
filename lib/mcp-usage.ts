export type McpToolCallStatus = "success" | "error";

export type McpToolCallEventType = "top_level" | "downstream_tool" | "schema_inspection";

export interface McpToolCallEventRow {
  id: string;
  user_id: string;
  request_id: string;
  mcp_session_id: string | null;
  server_id: string | null;
  server_name: string | null;
  app_key: string | null;
  tool_name: string;
  tool_namespace: string | null;
  event_type: McpToolCallEventType;
  status: McpToolCallStatus;
  error_code: string | null;
  error_preview: string | null;
  started_at: string;
  completed_at: string;
  duration_ms: number;
  created_at: string;
}

export interface McpToolCallEventGroup {
  parent: McpToolCallEventRow;
  children: McpToolCallEventRow[];
}

export interface McpUsageSummary {
  toolCallsTotal: number;
  orchestrationCallsTotal: number;
  successRate: number;
  streakDays: number;
  mostUsedApp: {
    key: string;
    name: string;
    count: number;
  } | null;
}

export interface McpUsageHeatmapDay {
  date: string;
  count: number;
  level: number;
  apps: McpUsageHeatmapApp[];
}

export interface McpUsageHeatmapApp {
  key: string;
  name: string;
  count: number;
  serverUrl?: string | null;
}

export interface McpUsageConnectionLike {
  sessionId: string;
  serverId: string;
  serverName: string;
  serverUrl: string;
}

const ORCHESTRATOR_APP_KEYS = new Set(["mcp_assistant", "workflow_automation_engine"]);

const KNOWN_APP_NAMES: Record<string, string> = {
  asana: "Asana",
  composio: "Composio",
  gmail: "Gmail",
  github: "GitHub",
  google_drive: "Google Drive",
  jira: "Jira",
  linear: "Linear",
  notion: "Notion",
  slack: "Slack",
};

const DAY_MS = 86_400_000;

export function getMcpAppDisplayName(
  appKey: string | null | undefined,
  serverName?: string | null
) {
  const normalizedKey = normalizeAppKey(appKey);
  if (normalizedKey && KNOWN_APP_NAMES[normalizedKey]) {
    return KNOWN_APP_NAMES[normalizedKey];
  }

  const displayName = serverName?.trim();
  if (displayName) {
    const normalizedDisplay = normalizeAppKey(displayName);
    if (normalizedDisplay === "workflow_automation_engine" || normalizedKey === "workflow_automation_engine") {
      return "MCP Assistant";
    }
    return displayName;
  }

  if (normalizedKey) {
    return titleCase(normalizedKey.replace(/[_-]+/g, " "));
  }

  return "MCP Server";
}

export function summarizeMcpUsage(
  events: McpToolCallEventRow[],
  now = new Date()
): McpUsageSummary {
  const toolCallsTotal = events.length;
  if (toolCallsTotal === 0) {
    return {
      toolCallsTotal: 0,
      orchestrationCallsTotal: 0,
      successRate: 0,
      streakDays: 0,
      mostUsedApp: null,
    };
  }

  const successCount = events.filter((event) => event.status === "success").length;
  const appCounts = new Map<string, { name: string; count: number }>();
  const activeDates = new Set<string>();
  const connectedEvents = filterConnectedMcpUsageEvents(events);
  const orchestrationCallsTotal = toolCallsTotal - connectedEvents.length;

  for (const event of events) {
    activeDates.add(getLocalDateKey(event.started_at));
  }

  for (const event of connectedEvents) {
    const key =
      normalizeAppKey(event.app_key) ||
      normalizeAppKey(event.server_id) ||
      normalizeAppKey(event.server_name) ||
      "mcp_server";
    if (key === "mcp_server") {
      continue;
    }
    const name = getMcpAppDisplayName(event.app_key, event.server_name);
    const current = appCounts.get(key);
    appCounts.set(key, {
      name,
      count: (current?.count ?? 0) + 1,
    });
  }

  const mostUsedAppEntry = [...appCounts.entries()].sort((a, b) => {
    const countDelta = b[1].count - a[1].count;
    return countDelta || a[1].name.localeCompare(b[1].name);
  })[0];

  return {
    toolCallsTotal,
    orchestrationCallsTotal,
    successRate: Math.round((successCount / toolCallsTotal) * 100),
    streakDays: countActiveDayStreak(activeDates, now),
    mostUsedApp: mostUsedAppEntry
      ? {
          key: mostUsedAppEntry[0],
          name: mostUsedAppEntry[1].name,
          count: mostUsedAppEntry[1].count,
        }
      : null,
  };
}

export function buildMcpUsageHeatmap(
  events: McpToolCallEventRow[],
  days = 90,
  now = new Date(),
  connections: McpUsageConnectionLike[] = []
): McpUsageHeatmapDay[] {
  const safeDays = Math.max(1, Math.floor(days));
  const countsByDate = new Map<string, number>();
  const connectedAppCountsByDate = new Map<string, Map<string, McpUsageHeatmapApp>>();
  for (const event of events) {
    const dateKey = getLocalDateKey(event.started_at);
    countsByDate.set(dateKey, (countsByDate.get(dateKey) ?? 0) + 1);

    const appKey =
      normalizeAppKey(event.app_key) ||
      normalizeAppKey(event.server_id) ||
      normalizeAppKey(event.server_name) ||
      "mcp_server";
    const appName = getMcpAppDisplayName(event.app_key, event.server_name);
    const serverUrl = resolveMcpUsageServerUrl(event, connections) ?? null;
    const appCounts = connectedAppCountsByDate.get(dateKey) ?? new Map<string, McpUsageHeatmapApp>();
    const current = appCounts.get(appKey);
    appCounts.set(appKey, {
      key: appKey,
      name: appName,
      count: (current?.count ?? 0) + 1,
      serverUrl: current?.serverUrl ?? serverUrl,
    });
    connectedAppCountsByDate.set(dateKey, appCounts);
  }

  return Array.from({ length: safeDays }, (_, index) => {
    const date = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() - (safeDays - index - 1)
    );
    const dateKey = getLocalDateKey(date);
    const count = countsByDate.get(dateKey) ?? 0;
    const apps = [...(connectedAppCountsByDate.get(dateKey)?.values() ?? [])].sort((a, b) => {
      const countDelta = b.count - a.count;
      return countDelta || a.name.localeCompare(b.name);
    });
    return {
      date: dateKey,
      count,
      level: getHeatmapLevel(count),
      apps,
    };
  });
}

export function resolveMcpUsageServerUrl(
  event: Pick<McpToolCallEventRow, "mcp_session_id" | "server_id" | "server_name" | "app_key">,
  connections: McpUsageConnectionLike[]
) {
  const normalizedServerId = normalizeAppKey(event.server_id);
  const normalizedServerName = normalizeAppKey(event.server_name);
  const normalizedAppKey = normalizeAppKey(event.app_key);

  const byServerIdentity = connections.find((connection) => {
    const connectionServerId = normalizeAppKey(connection.serverId);
    const connectionServerName = normalizeAppKey(connection.serverName);
    return (
      (normalizedServerId && connectionServerId === normalizedServerId) ||
      (normalizedServerName && connectionServerName === normalizedServerName) ||
      (normalizedAppKey && connectionServerId === normalizedAppKey)
    );
  });

  if (byServerIdentity?.serverUrl) {
    return byServerIdentity.serverUrl;
  }

  const bySessionId = connections.find((connection) => connection.sessionId === event.mcp_session_id);
  return bySessionId?.serverUrl ?? null;
}

export function isMcpAssistantOrchestratorEvent(
  event: Pick<McpToolCallEventRow, "server_id" | "server_name" | "app_key">
) {
  return [event.app_key, event.server_id, event.server_name]
    .map(normalizeAppKey)
    .some((value) => Boolean(value && ORCHESTRATOR_APP_KEYS.has(value)));
}

export function filterConnectedMcpUsageEvents(events: McpToolCallEventRow[]) {
  return events.filter((event) => !isMcpAssistantOrchestratorEvent(event));
}

function countActiveDayStreak(activeDates: Set<string>, now: Date) {
  let streak = 0;
  const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  while (activeDates.has(getLocalDateKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

function getHeatmapLevel(count: number) {
  if (count <= 0) return 0;
  if (count <= 2) return 1;
  if (count <= 5) return 2;
  if (count <= 10) return 3;
  return 4;
}

export function getLocalDateKey(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeAppKey(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return normalized || null;
}

function titleCase(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
