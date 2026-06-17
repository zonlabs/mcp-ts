"use client";

import { Fragment, useMemo, useState, useEffect, useRef } from "react";
import { Activity, CheckCircle2, Clock3, XCircle } from "lucide-react";
import { ServerIcon } from "@/components/common/ServerIcon";
import { cn } from "@/lib/utils";
import type { McpToolCallEventRow, McpUsageConnectionLike } from "@/lib/mcp-usage";
import {
  buildMcpUsageHeatmap,
  getMcpAppDisplayName,
  getLocalDateKey,
  resolveMcpUsageServerUrl,
  summarizeMcpUsage,
} from "@/lib/mcp-usage";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

const RECENT_ACTIVITY_PAGE_SIZE = 10;

interface McpUsageOverviewProps {
  events: McpToolCallEventRow[];
  connections: McpUsageConnectionLike[];
  metricsEvents: McpToolCallEventRow[];
  totalCount: number;
  currentPage: number;
  onPageChange?: (newPage: number) => void;
  days?: number;
}

export function McpUsageOverview({
  events,
  connections,
  metricsEvents,
  totalCount,
  currentPage,
  onPageChange,
  days,
}: McpUsageOverviewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>(0);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const daysToShow = useMemo(() => {
    if (days !== undefined) {
      return days;
    }
    if (containerWidth <= 0) return 90; // Fallback before measurement
    const availableWidth = containerWidth - 8; // Safety margin
    const columns = Math.floor((availableWidth + 5) / 18);
    const calculatedDays = Math.max(7, columns * 7);
    return Math.min(365, calculatedDays);
  }, [containerWidth, days]);

  const handlePageChange = (newPage: number) => {
    if (onPageChange) {
      onPageChange(newPage);
      return;
    }
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("page", newPage.toString());
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  if (metricsEvents.length === 0) {
    return (
      <section id="usage" className="space-y-4 scroll-mt-24">
        <div className="rounded-2xl border border-red-500/20 bg-background p-6 dark:border-red-400/20">
          <p className="text-sm font-medium text-foreground">No tool calls yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Once you use a connected MCP server, the activity panel will show up here.
          </p>
        </div>
      </section>
    );
  }

  const summary = summarizeMcpUsage(metricsEvents);
  const heatmap = buildMcpUsageHeatmap(metricsEvents, daysToShow, new Date(), connections);
  // Compute max count for relative color scaling
  const maxCount = heatmap.reduce((m, d) => Math.max(m, d.count), 0);
  const recentEventGroups = useMemo(() => groupRecentEventsByDate(events), [events]);
  const mostUsedAppEvent = summary.mostUsedApp
    ? metricsEvents.find((event) => getUsageEventKey(event) === summary.mostUsedApp?.key)
    : undefined;
  const mostUsedAppServerUrl = mostUsedAppEvent
    ? resolveMcpUsageServerUrl(mostUsedAppEvent, connections) ?? undefined
    : undefined;

  return (
    <section id="usage" className="space-y-4 scroll-mt-24">
      <div className="rounded-2xl border border-red-500/20 bg-background p-4 dark:border-red-400/20 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-foreground">All tool calls</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Includes MCP Assistant and downstream MCP server calls.
            </p>
          </div>
        </div>

        <div ref={containerRef} className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:overflow-x-auto sm:px-0 scrollbar-minimal">
          <TooltipProvider delayDuration={100}>
          <div className="grid min-w-max grid-flow-col grid-rows-7 justify-start gap-[5px]">
            {heatmap.map((day) => {
              const tooltipItems = day.apps.slice(0, 3);
              const otherApps = day.apps.slice(tooltipItems.length);
              const otherCount = otherApps.length;
              const otherToolCalls = otherApps.reduce((total, app) => total + app.count, 0);

              return (
                <Tooltip key={day.date}>
                  <TooltipTrigger asChild>
                    <div
                      className={cn(
                        "h-[13px] w-[13px] rounded-[3px] cursor-default",
                        getHeatmapColorClass(day.count, maxCount)
                      )}
                    />
                  </TooltipTrigger>
                  <TooltipContent
                    side="top"
                    sideOffset={6}
                    className="z-[300] w-56 p-0 overflow-hidden bg-popover text-popover-foreground border border-border shadow-lg"
                    avoidCollisions={true}
                    collisionPadding={8}
                  >
                    <div className="px-3 py-2">
                      <div className="flex items-center justify-between gap-3 border-b border-border pb-1.5 text-xs">
                        <span className="font-medium">{formatTooltipDate(day.date)}</span>
                        <span className="text-muted-foreground">{day.count} calls</span>
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
                                <span className="min-w-0 flex-1 truncate">{app.name}</span>
                                <span className="shrink-0 text-muted-foreground">{app.count}</span>
                              </div>
                            ))}
                            {otherCount > 0 ? (
                              <div className="flex items-center gap-2 text-xs">
                                <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded-sm bg-muted text-[9px] font-semibold text-muted-foreground">
                                  +
                                </div>
                                <span className="min-w-0 flex-1 truncate">
                                  {otherCount} other{otherCount === 1 ? "" : "s"}
                                </span>
                                <span className="shrink-0 text-muted-foreground">{otherToolCalls}</span>
                              </div>
                            ) : null}
                          </>
                        ) : <p className="text-xs text-muted-foreground">No tool calls</p>}
                      </div>
                    </div>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
          </TooltipProvider>
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
              <div className="space-y-2 sm:space-y-0">
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
              Showing {events.length === 0 ? 0 : (currentPage - 1) * RECENT_ACTIVITY_PAGE_SIZE + 1}-{Math.min(
                currentPage * RECENT_ACTIVITY_PAGE_SIZE,
                totalCount
              )} of {totalCount}
            </p>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
              <button
                type="button"
                className="inline-flex h-9 min-w-full items-center justify-center rounded-md border border-red-500/20 px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-400/20 sm:min-w-0"
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage <= 1}
              >
                Previous
              </button>
              <button
                type="button"
                className="inline-flex h-9 min-w-full items-center justify-center rounded-md border border-red-500/20 px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-400/20 sm:min-w-0"
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage * RECENT_ACTIVITY_PAGE_SIZE >= totalCount}
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
      label: dateKey === todayKey ? "TODAY" : formatRecentActivityDateLabel(dateKey).toUpperCase(),
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
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2 rounded-xl border border-red-500/20 bg-muted/10 p-3 text-sm dark:border-red-400/20 sm:grid-cols-[6rem_12rem_1fr_5rem_5rem] sm:items-center sm:gap-3 sm:rounded-none sm:border-x-0 sm:border-b-0 sm:border-t sm:border-red-500/20 dark:sm:border-red-400/20 first:sm:border-t-0 sm:bg-transparent sm:px-4 sm:py-3">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Clock3 className="h-4 w-4" />
        <span>{formatTime(event.started_at)}</span>
      </div>
      <div className="col-span-2 flex min-w-0 items-center gap-2 sm:col-span-1">
        <ServerIcon serverName={appName} serverUrl={serverUrl} size={28} className="shrink-0 rounded-lg" />
        {event.server_id || serverUrl ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="truncate cursor-help">
                {appName}
              </span>
            </TooltipTrigger>
            <TooltipContent side="top">
              <div className="space-y-1 text-xs">
                {event.server_id && (
                  <p className="font-mono"><span className="text-muted-foreground">Server ID: </span>{event.server_id}</p>
                )}
                {serverUrl && (
                  <p className="font-mono"><span className="text-muted-foreground">Server URL: </span>{serverUrl}</p>
                )}
              </div>
            </TooltipContent>
          </Tooltip>
        ) : (
          <span className="truncate">
            {appName}
          </span>
        )}
      </div>
      <div className="col-span-2 min-w-0 sm:col-span-1">
        <p
          className="break-all whitespace-normal font-mono text-xs tracking-tight sm:text-sm text-foreground"
          style={{ wordBreak: "break-all", whiteSpace: "normal" }}
          title={event.tool_name}
        >
          {event.tool_name}
        </p>
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

function getHeatmapColorClass(count: number, maxCount: number): string {
  if (count <= 0 || maxCount <= 0) return "bg-muted/60";
  // Use relative percentile of max so colors always span the full range
  const ratio = count / maxCount;
  if (ratio <= 0.25) return "bg-emerald-200 dark:bg-emerald-950";
  if (ratio <= 0.5)  return "bg-emerald-300 dark:bg-emerald-800";
  if (ratio <= 0.75) return "bg-emerald-500 dark:bg-emerald-600";
  return "bg-emerald-700 dark:bg-emerald-400";
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(value));
}

// Format duration
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
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return new Intl.DateTimeFormat("en", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}



function getUsageEventKey(event: Pick<McpToolCallEventRow, "app_key" | "server_id" | "server_name">) {
  return normalizeValue(event.app_key) || normalizeValue(event.server_id) || normalizeValue(event.server_name) || "mcp_server";
}

function normalizeValue(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return normalized || null;
}
