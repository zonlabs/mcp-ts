"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useState } from "react";
import { Activity, CheckCircle2, Clock3, KeyRound, XCircle } from "lucide-react";
import { ServerIcon } from "@/components/common/ServerIcon";
import { cn } from "@/lib/utils";
import type { McpToolCallEventRow, McpUsageConnectionLike } from "@/lib/mcp-usage";
import {
  buildMcpUsageHeatmap,
  getMcpAppDisplayName,
  resolveMcpUsageServerUrl,
  summarizeMcpUsage,
} from "@/lib/mcp-usage";

const RECENT_ACTIVITY_PAGE_SIZE = 6;

interface McpUsageOverviewProps {
  events: McpToolCallEventRow[];
  connections: McpUsageConnectionLike[];
}

export function McpUsageOverview({ events, connections }: McpUsageOverviewProps) {
  const [recentActivityPage, setRecentActivityPage] = useState(0);

  useEffect(() => {
    setRecentActivityPage(0);
  }, [events]);

  if (events.length === 0) {
    return (
      <section id="usage" className="space-y-4 scroll-mt-24">
        <UsageHeader />

        <div className="rounded-2xl border border-red-500/20 bg-background p-6 dark:border-red-400/20">
          <p className="text-sm font-medium text-foreground">No tool calls yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Once you use a connected MCP server, the activity panel will show up here.
          </p>
        </div>
      </section>
    );
  }

  const summary = summarizeMcpUsage(events);
  const heatmap = buildMcpUsageHeatmap(events, 365, new Date(), connections);
  const recentActivityPageCount = Math.max(1, Math.ceil(events.length / RECENT_ACTIVITY_PAGE_SIZE));
  const safeRecentActivityPage = Math.min(recentActivityPage, recentActivityPageCount - 1);
  const recentEventsStart = safeRecentActivityPage * RECENT_ACTIVITY_PAGE_SIZE;
  const recentEvents = events.slice(recentEventsStart, recentEventsStart + RECENT_ACTIVITY_PAGE_SIZE);
  const recentEventGroups = useMemo(() => groupRecentEventsByDate(recentEvents), [recentEvents]);
  const mostUsedAppEvent = summary.mostUsedApp
    ? events.find((event) => getUsageEventKey(event) === summary.mostUsedApp?.key)
    : undefined;
  const mostUsedAppServerUrl = mostUsedAppEvent
    ? resolveMcpUsageServerUrl(mostUsedAppEvent, connections) ?? undefined
    : undefined;

  return (
    <section id="usage" className="space-y-4 scroll-mt-24">
      <UsageHeader />

      <div className="rounded-2xl border border-red-500/20 bg-background p-4 dark:border-red-400/20 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-foreground">All tool calls</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Includes MCP Assistant and downstream MCP server calls.
            </p>
          </div>
        </div>

        <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:overflow-visible sm:px-0">
          <div className="grid min-w-max grid-flow-col grid-rows-7 justify-start gap-[5px]">
            {heatmap.map((day) => {
              const tooltipItems = day.apps.slice(0, 3);
              const otherApps = day.apps.slice(tooltipItems.length);
              const otherCount = otherApps.length;
              const otherToolCalls = otherApps.reduce((total, app) => total + app.count, 0);

              return (
                <div key={day.date} className="group relative">
                  <div className={cn("h-[13px] w-[13px] rounded-[3px]", getHeatmapClassName(day.level))} />
                  <div className="hidden sm:pointer-events-none sm:absolute sm:left-1/2 sm:bottom-full sm:z-30 sm:mb-2 sm:block sm:w-64 sm:-translate-x-1/2 sm:opacity-0 sm:transition-opacity sm:duration-150 sm:group-hover:opacity-100">
                    <div className="rounded-md border border-red-500/20 bg-background px-3 py-2 shadow-lg shadow-black/10 dark:border-red-400/20">
                      <div className="flex items-center justify-between gap-3 border-b border-red-500/20 pb-1.5 text-xs dark:border-red-400/20">
                        <span className="font-medium text-foreground">{formatTooltipDate(day.date)}</span>
                        <span className="text-muted-foreground">{day.count}</span>
                      </div>
                      <div className="mt-2 space-y-1">
                        {tooltipItems.length > 0 ? (
                          <>
                            {tooltipItems.map((app) => (
                              <div key={`${day.date}-${app.key}`} className="flex items-center gap-2 text-xs">
                                <ServerIcon
                                  serverName={app.name}
                                  serverUrl={app.serverUrl ?? undefined}
                                  size={16}
                                  className="shrink-0 rounded-sm"
                                />
                                <span className="min-w-0 flex-1 truncate text-foreground">{app.name}</span>
                                <span className="shrink-0 text-muted-foreground">{app.count}</span>
                              </div>
                            ))}
                            {otherCount > 0 ? (
                              <div className="flex items-center gap-2 text-xs">
                                <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded-sm bg-muted/50 text-[9px] font-semibold text-muted-foreground">
                                  +
                                </div>
                                <span className="min-w-0 flex-1 truncate text-foreground">
                                  {otherCount} other{otherCount === 1 ? "" : "s"}
                                </span>
                                <span className="shrink-0 text-muted-foreground">{otherToolCalls}</span>
                              </div>
                            ) : null}
                          </>
                        ) : <p className="text-xs text-muted-foreground">No app breakdown</p>}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <UsageMetric label="Tool Calls" value={summary.toolCallsTotal.toLocaleString()} />
          <UsageMetric
            label="MCP Assistant"
            value={summary.orchestrationCallsTotal.toLocaleString()}
            // subtitle="Orchestrator"
          />
          <UsageMetric label="Streak" value={`${summary.streakDays} Days`} />
          <UsageMetric
            label="Most Used App"
            value={summary.mostUsedApp?.name ?? "None yet"}
            serverUrl={mostUsedAppServerUrl}
          />
        </div>
      </div>

      <div className="space-y-3 pb-8">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Recent Activity</h3>
        </div>

        <div className="space-y-5 rounded-2xl border border-red-500/20 bg-background p-3 dark:border-red-400/20 sm:p-5">
        <div className="space-y-4">
          {recentEventGroups.map((group) => (
            <section key={group.dateKey} className="space-y-2">
              <div className="px-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                {group.label}
              </div>
              <div className="space-y-2 sm:divide-y sm:divide-red-500/20 sm:space-y-0 dark:sm:divide-red-400/20">
                {group.events.map((event) => (
                  <RecentActivityRow
                    key={event.id}
                    event={event}
                    serverUrl={resolveMcpUsageServerUrl(event, connections) ?? undefined}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>

          <div className="flex flex-col gap-3 border-t border-red-500/20 px-1 py-3 dark:border-red-400/20 sm:flex-row sm:items-center sm:justify-between sm:px-4">
            <p className="text-xs text-muted-foreground">
              Showing {events.length === 0 ? 0 : recentEventsStart + 1}-{Math.min(
                recentEventsStart + RECENT_ACTIVITY_PAGE_SIZE,
                events.length
              )} of {events.length}
            </p>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
              <button
                type="button"
                className="inline-flex h-9 min-w-full items-center justify-center rounded-md border border-red-500/20 px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-400/20 sm:min-w-0"
                onClick={() => setRecentActivityPage((current) => Math.max(0, current - 1))}
                disabled={safeRecentActivityPage === 0}
              >
                Previous
              </button>
              <button
                type="button"
                className="inline-flex h-9 min-w-full items-center justify-center rounded-md border border-red-500/20 px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-400/20 sm:min-w-0"
                onClick={() =>
                  setRecentActivityPage((current) => Math.min(recentActivityPageCount - 1, current + 1))
                }
                disabled={safeRecentActivityPage >= recentActivityPageCount - 1}
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function UsageHeader() {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-1 pl-4 sm:pl-0">
        <h2 className="text-xl font-semibold tracking-tight">Activity</h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          All MCP tool calls through MCP Assistant.
        </p>
      </div>
      <Link
        href="/settings/api-keys"
        className="inline-flex w-fit items-center gap-2 rounded-full border border-red-500/20 bg-background px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted dark:border-red-400/20"
      >
        Manage API keys
        <KeyRound className="h-4 w-4" />
      </Link>
    </div>
  );
}

function groupRecentEventsByDate(events: McpToolCallEventRow[]) {
  const todayKey = getLocalDateKey(new Date());
  const groups: Array<{
    dateKey: string;
    label: string;
    events: McpToolCallEventRow[];
  }> = [];

  for (const event of events) {
    const dateKey = getLocalDateKey(event.started_at);
    const existing = groups.find((group) => group.dateKey === dateKey);
    if (existing) {
      existing.events.push(event);
      continue;
    }

    groups.push({
      dateKey,
      label: dateKey === todayKey ? "Today" : formatRecentActivityDateLabel(dateKey),
      events: [event],
    });
  }

  return groups;
}

function UsageMetric({
  label,
  value,
  subtitle,
  serverUrl,
}: {
  label: string;
  value: string;
  subtitle?: string;
  serverUrl?: string;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-red-500/20 bg-muted/10 p-3 dark:border-red-400/20 sm:border-0 sm:bg-transparent sm:p-0">
      <p className="mb-1 text-sm text-muted-foreground">{label}</p>
      <div className="flex items-center gap-2">
        {serverUrl ? (
          <ServerIcon serverName={value} serverUrl={serverUrl} size={20} className="shrink-0" />
        ) : null}
        <p className="min-w-0 max-w-[20rem] truncate text-xl font-semibold tracking-tight sm:text-2xl">
          {value}
        </p>
      </div>
      {subtitle ? <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p> : null}
    </div>
  );
}

function RecentActivityRow({
  event,
  serverUrl,
}: {
  event: McpToolCallEventRow;
  serverUrl?: string;
}) {
  const appName = getMcpAppDisplayName(event.app_key, event.server_name);
  const isSuccess = event.status === "success";

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2 rounded-xl border border-red-500/20 bg-muted/10 p-3 text-sm dark:border-red-400/20 sm:grid-cols-[8rem_10rem_minmax(0,1fr)_7rem_5rem] sm:items-center sm:gap-3 sm:rounded-none sm:border-0 sm:bg-transparent sm:px-4 sm:py-3">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Clock3 className="h-4 w-4" />
        <span>{formatTime(event.started_at)}</span>
      </div>
      <div className="col-span-2 flex min-w-0 items-center gap-2 sm:col-span-1">
        <ServerIcon serverName={appName} serverUrl={serverUrl} size={28} className="shrink-0 rounded-lg" />
        <span className="max-w-[14rem] truncate">
          {appName}
        </span>
      </div>
      <div className="col-span-2 min-w-0 sm:col-span-1">
        <p className="truncate font-mono text-xs tracking-tight sm:text-sm">{event.tool_name}</p>
        {!isSuccess && event.error_preview ? (
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground sm:truncate">{event.error_preview}</p>
        ) : null}
      </div>
      <div className="col-span-2 text-xs text-muted-foreground sm:col-span-1">{formatDuration(event.duration_ms)}</div>
      <div
        className={cn(
          "row-start-1 flex items-center justify-end gap-1.5 text-xs font-medium sm:row-auto sm:justify-start",
          isSuccess ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"
        )}
      >
        {isSuccess ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
        {isSuccess ? "OK" : "Error"}
      </div>
    </div>
  );
}

function getHeatmapClassName(level: number) {
  switch (level) {
    case 1:
      return "bg-emerald-200 dark:bg-emerald-950";
    case 2:
      return "bg-emerald-300 dark:bg-emerald-800";
    case 3:
      return "bg-emerald-400 dark:bg-emerald-600";
    case 4:
      return "bg-emerald-600 dark:bg-emerald-400";
    default:
      return "bg-muted/60";
  }
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDuration(durationMs: number) {
  if (durationMs <= 0) return "<1ms";
  if (durationMs < 1000) return `${durationMs}ms`;
  return `${(durationMs / 1000).toFixed(1)}s`;
}

function formatTooltipDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function formatRecentActivityDateLabel(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function getLocalDateKey(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getUsageEventKey(event: Pick<McpToolCallEventRow, "app_key" | "server_id" | "server_name">) {
  return normalizeValue(event.app_key) || normalizeValue(event.server_id) || normalizeValue(event.server_name) || "mcp_server";
}

function normalizeValue(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return normalized || null;
}
