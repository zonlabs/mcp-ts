export type McpToolCallStatus = "success" | "error";

export type McpToolCallEventType = "top_level" | "downstream_tool" | "schema_inspection";

export interface ServerIcon {
  src: string;
  sizes?: string;
  type?: string;
}

export interface McpToolCallEventRow {
  id: string;
  user_id: string;
  request_id: string;
  mcp_session_id: string | null;
  server_id: string | null;
  server_name: string | null;
  server_url: string | null;
  server_icons: ServerIcon[] | null;
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
  mcpAssistantCallsTotal: number;
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
  serverIcons?: ServerIcon[] | null;
}

const ORCHESTRATOR_APP_KEYS = new Set(["linkos"]);

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
    return displayName;
  }

  if (normalizedKey) {
    return titleCase(normalizedKey.replace(/[_-]+/g, " "));
  }

  return "MCP Server";
}

export function summarizeMcpUsage(
  events: McpToolCallEventRow[],
  now = new Date(),
  exactTotalCalls?: number
): McpUsageSummary {
  const toolCallsTotal = exactTotalCalls ?? events.length;
  if (toolCallsTotal === 0 && events.length === 0) {
    return {
      toolCallsTotal: 0,
      mcpAssistantCallsTotal: 0,
      orchestrationCallsTotal: 0,
      successRate: 0,
      streakDays: 0,
      mostUsedApp: null,
    };
  }

  // Upstream tool calls from LinkOS only (excluding downstream tool calls)
  const upstreamEvents = events.filter((e) => !e.event_type || e.event_type === "top_level");
  const mcpAssistantCallsTotal = upstreamEvents.length;

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
    mcpAssistantCallsTotal,
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
    const serverUrl = event.server_url ?? null;
    const serverIcons = event.server_icons ?? null;
    const appCounts = connectedAppCountsByDate.get(dateKey) ?? new Map<string, McpUsageHeatmapApp>();
    const current = appCounts.get(appKey);
    appCounts.set(appKey, {
      key: appKey,
      name: appName,
      count: (current?.count ?? 0) + 1,
      serverUrl: current?.serverUrl ?? serverUrl,
      serverIcons: current?.serverIcons ?? serverIcons,
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
  event: Pick<McpToolCallEventRow, "server_url">
) {
  return event.server_url ?? null;
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

export interface McpAnalyticsData {
  latency: {
    avgDurationMs: number;
    p50DurationMs: number;
    p95DurationMs: number;
    dailyLatency: {
      date: string;
      label: string;
      avgMs: number;
      p95Ms: number;
      count: number;
    }[];
    slowestTools: {
      toolName: string;
      appDisplayName: string;
      avgDurationMs: number;
      count: number;
    }[];
  };
  reliability: {
    totalCalls: number;
    successCount: number;
    errorCount: number;
    successRate: number;
    topErrors: {
      errorCode: string;
      count: number;
      recentPreview?: string | null;
    }[];
    topFailingTools: {
      toolName: string;
      appDisplayName: string;
      errorCount: number;
      totalCount: number;
    }[];
  };
  distribution: {
    apps: {
      key: string;
      name: string;
      count: number;
      percentage: number;
      serverUrl?: string | null;
      serverIcons?: ServerIcon[] | null;
    }[];
    topTools: {
      toolName: string;
      appDisplayName: string;
      count: number;
      percentage: number;
      serverUrl?: string | null;
      serverIcons?: ServerIcon[] | null;
    }[];
    topLevelCount: number;
    downstreamCount: number;
    orchestrationRatio: number;
  };
  hourlyActivity: {
    hour: number;
    label: string;
    displayLabel: string;
    count: number;
    percentage: number;
  }[];
}

export function computeMcpAnalytics(events: McpToolCallEventRow[]): McpAnalyticsData {
  const totalCalls = events.length;

  // 1. Reliability & Status
  let successCount = 0;
  let errorCount = 0;
  const errorMap = new Map<string, { count: number; recentPreview?: string | null }>();
  const toolErrorMap = new Map<string, { toolName: string; appDisplayName: string; errorCount: number; totalCount: number }>();

  // 2. Latency
  const durations: number[] = [];
  const dailyLatencyMap = new Map<string, number[]>();
  const toolDurationMap = new Map<string, { toolName: string; appDisplayName: string; durations: number[] }>();

  // 3. Distribution & Ecosystem
  const appCounts = new Map<string, { key: string; name: string; count: number; serverUrl?: string | null; serverIcons?: ServerIcon[] | null }>();
  const toolInvocationMap = new Map<
    string,
    {
      toolName: string;
      appDisplayName: string;
      count: number;
      serverUrl?: string | null;
      serverIcons?: ServerIcon[] | null;
    }
  >();
  let topLevelCount = 0;
  let downstreamCount = 0;

  // 4. Hourly Activity (24 buckets: 0 to 23)
  const hourlyCounts = new Array(24).fill(0);

  for (const event of events) {
    const isSuccess = event.status === "success";
    if (isSuccess) {
      successCount += 1;
    } else {
      errorCount += 1;
      const errorCode = event.error_code || "UNKNOWN_ERROR";
      const errEntry = errorMap.get(errorCode) ?? { count: 0, recentPreview: null };
      errEntry.count += 1;
      if (!errEntry.recentPreview && event.error_preview) {
        errEntry.recentPreview = event.error_preview;
      }
      errorMap.set(errorCode, errEntry);
    }

    const appName = getMcpAppDisplayName(event.app_key, event.server_name);
    const toolKey = `${appName}::${event.tool_name}`;

    // Tool error tracking
    const toolErr = toolErrorMap.get(toolKey) ?? { toolName: event.tool_name, appDisplayName: appName, errorCount: 0, totalCount: 0 };
    toolErr.totalCount += 1;
    if (!isSuccess) {
      toolErr.errorCount += 1;
    }
    toolErrorMap.set(toolKey, toolErr);

    // Duration tracking
    const duration = Math.max(0, event.duration_ms ?? 0);
    durations.push(duration);

    // Daily latency
    const dateKey = getLocalDateKey(event.started_at);
    if (!dailyLatencyMap.has(dateKey)) {
      dailyLatencyMap.set(dateKey, []);
    }
    dailyLatencyMap.get(dateKey)!.push(duration);

    // Tool durations
    const toolDur = toolDurationMap.get(toolKey) ?? { toolName: event.tool_name, appDisplayName: appName, durations: [] };
    toolDur.durations.push(duration);
    toolDurationMap.set(toolKey, toolDur);

    // App counts (for connected apps)
    const appKey =
      normalizeAppKey(event.app_key) ||
      normalizeAppKey(event.server_id) ||
      normalizeAppKey(event.server_name) ||
      "mcp_server";
    if (appKey !== "mcp_server") {
      const currentApp = appCounts.get(appKey) ?? {
        key: appKey,
        name: appName,
        count: 0,
        serverUrl: event.server_url,
        serverIcons: event.server_icons,
      };
      currentApp.count += 1;
      appCounts.set(appKey, currentApp);
    }

    // Top tools
    const toolInv = toolInvocationMap.get(toolKey) ?? {
      toolName: event.tool_name,
      appDisplayName: appName,
      count: 0,
      serverUrl: event.server_url,
      serverIcons: event.server_icons,
    };
    toolInv.count += 1;
    if (!toolInv.serverIcons && event.server_icons) {
      toolInv.serverIcons = event.server_icons;
    }
    if (!toolInv.serverUrl && event.server_url) {
      toolInv.serverUrl = event.server_url;
    }
    toolInvocationMap.set(toolKey, toolInv);

    // Hierarchy
    if (event.event_type === "downstream_tool") {
      downstreamCount += 1;
    } else {
      topLevelCount += 1;
    }

    // Hourly
    try {
      const date = new Date(event.started_at);
      const hour = date.getHours();
      if (hour >= 0 && hour < 24) {
        hourlyCounts[hour] += 1;
      }
    } catch {
      // ignore date parse issues
    }
  }

  // Calculate Latency Percentiles
  durations.sort((a, b) => a - b);
  const avgDurationMs = durations.length > 0 ? Math.round(durations.reduce((acc, d) => acc + d, 0) / durations.length) : 0;
  const p50DurationMs = durations.length > 0 ? durations[Math.floor(durations.length * 0.5)] : 0;
  const p95DurationMs = durations.length > 0 ? durations[Math.min(durations.length - 1, Math.floor(durations.length * 0.95))] : 0;

  // Daily Latency Points (sorted chronologically, up to last 14 active days)
  const sortedDates = [...dailyLatencyMap.keys()].sort();
  const recentDates = sortedDates.slice(-14);
  const dailyLatency = recentDates.map((dateKey) => {
    const list = dailyLatencyMap.get(dateKey)!.sort((a, b) => a - b);
    const avg = Math.round(list.reduce((sum, val) => sum + val, 0) / list.length);
    const p95 = list[Math.min(list.length - 1, Math.floor(list.length * 0.95))];
    const dateObj = new Date(dateKey + "T00:00:00");
    const label = new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(dateObj);
    return {
      date: dateKey,
      label,
      avgMs: avg,
      p95Ms: p95,
      count: list.length,
    };
  });

  // Slowest Tools (minimum 1 call, ranked by avgDurationMs descending, top 5)
  const slowestTools = [...toolDurationMap.values()]
    .map((t) => ({
      toolName: t.toolName,
      appDisplayName: t.appDisplayName,
      avgDurationMs: Math.round(t.durations.reduce((sum, d) => sum + d, 0) / t.durations.length),
      count: t.durations.length,
    }))
    .sort((a, b) => b.avgDurationMs - a.avgDurationMs)
    .slice(0, 5);

  // Reliability
  const successRate = totalCalls > 0 ? Math.round((successCount / totalCalls) * 100) : 100;
  const topErrors = [...errorMap.entries()]
    .map(([errorCode, val]) => ({
      errorCode,
      count: val.count,
      recentPreview: val.recentPreview,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const topFailingTools = [...toolErrorMap.values()]
    .filter((t) => t.errorCount > 0)
    .sort((a, b) => b.errorCount - a.errorCount)
    .slice(0, 5);

  // App Distribution
  const totalAppCalls = [...appCounts.values()].reduce((sum, a) => sum + a.count, 0) || 1;
  const apps = [...appCounts.values()]
    .map((a) => ({
      ...a,
      percentage: Math.round((a.count / totalAppCalls) * 100),
    }))
    .sort((a, b) => b.count - a.count);

  // Top Tools
  const topTools = [...toolInvocationMap.values()]
    .map((t) => ({
      ...t,
      percentage: totalCalls > 0 ? Math.round((t.count / totalCalls) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // Orchestration ratio
  const orchestrationRatio = totalCalls > 0 ? Math.round((downstreamCount / totalCalls) * 100) : 0;

  // Hourly Activity
  const maxHourly = Math.max(1, ...hourlyCounts);
  const hourlyActivity = hourlyCounts.map((count, hour) => {
    const period = hour >= 12 ? "PM" : "AM";
    const displayHour = hour % 12 === 0 ? 12 : hour % 12;
    return {
      hour,
      label: String(hour).padStart(2, "0"),
      displayLabel: `${displayHour} ${period}`,
      count,
      percentage: Math.round((count / maxHourly) * 100),
    };
  });

  return {
    latency: {
      avgDurationMs,
      p50DurationMs,
      p95DurationMs,
      dailyLatency,
      slowestTools,
    },
    reliability: {
      totalCalls,
      successCount,
      errorCount,
      successRate,
      topErrors,
      topFailingTools,
    },
    distribution: {
      apps,
      topTools,
      topLevelCount,
      downstreamCount,
      orchestrationRatio,
    },
    hourlyActivity,
  };
}
