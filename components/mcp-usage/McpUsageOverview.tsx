"use client";

import { Fragment, useMemo, useState, useEffect, useRef } from "react";
import { Activity, CheckCircle2, Clock3, XCircle } from "lucide-react";
import { ServerIcon } from "@/components/common/ServerIcon";
import { cn } from "@/lib/utils";
import type { McpToolCallEventRow, McpToolCallEventGroup, McpUsageConnectionLike } from "@/lib/mcp-usage";
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
  groups: McpToolCallEventGroup[];
  connections: McpUsageConnectionLike[];
  metricsEvents: McpToolCallEventRow[];
  totalCount: number;
  currentPage: number;
  onPageChange?: (newPage: number) => void;
  isFetching?: boolean;
  days?: number;
  healthStatus?: string;
  healthData?: {
    version?: string;
    uptime_seconds?: number;
    avg_latency_ms?: number;
    resources?: {
      memory_mb?: number;
      cpu_percent?: number;
    };
  } | null;
}

export function McpUsageOverview({
  groups,
  connections,
  metricsEvents,
  totalCount,
  currentPage,
  onPageChange,
  isFetching,
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
        <div className="rounded-2xl bg-background p-6">
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
  const recentEventGroups = useMemo(() => groupRecentGroupsByDate(groups), [groups]);
  const mostUsedAppEvent = summary.mostUsedApp
    ? metricsEvents.find((event) => getUsageEventKey(event) === summary.mostUsedApp?.key)
    : undefined;
  const mostUsedAppServerUrl = mostUsedAppEvent
    ? resolveMcpUsageServerUrl(mostUsedAppEvent, connections) ?? undefined
    : undefined;

  return (
    <section id="usage" className="space-y-4 scroll-mt-24">
      <div className="rounded-2xl bg-background p-4 sm:p-6">
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

      <div className="space-y-2 pb-6">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Recent Activity</h3>
        </div>

        <div className="space-y-3 rounded-xl bg-background p-2 sm:p-4">
          <div className="space-y-3">
            {isFetching && groups.length > 0 ? (
              <div className="space-y-3">
                <div className="px-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  <div className="h-3 w-16 animate-pulse rounded bg-muted" />
                </div>
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2 p-3 sm:grid-cols-[6rem_12rem_1fr_5rem_5rem] sm:gap-3 sm:px-4 sm:py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-4 w-4 animate-pulse rounded bg-muted" />
                      <div className="h-3 w-12 animate-pulse rounded bg-muted" />
                    </div>
                    <div className="flex items-center gap-2 sm:col-span-1 col-span-2">
                      <div className="h-7 w-7 animate-pulse rounded-lg bg-muted" />
                      <div className="h-3 w-24 animate-pulse rounded bg-muted" />
                    </div>
                    <div className="col-span-2 sm:col-span-1">
                      <div className="h-3 w-32 animate-pulse rounded bg-muted" />
                    </div>
                    <div className="col-span-2 sm:col-span-1">
                      <div className="h-3 w-10 animate-pulse rounded bg-muted" />
                    </div>
                    <div>
                      <div className="h-3 w-8 animate-pulse rounded bg-muted" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              recentEventGroups.map((dateGroup) => (
                <section key={dateGroup.dateKey} className="space-y-1">
                  <div className="px-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    {dateGroup.label}
                  </div>
                  <div className="space-y-1 sm:space-y-0">
                    {dateGroup.groups.map((eventGroup, idx) => (
                      <div key={eventGroup.parent.id} className={cn(idx > 0 && "sm:border-t sm:border-red-500/20 dark:sm:border-red-400/20 sm:mt-2")}>
                        <RecentActivityRow
                          event={eventGroup.parent}
                          serverUrl={resolveMcpUsageServerUrl(eventGroup.parent, connections) ?? undefined}
                          childCount={eventGroup.children.length}
                        />
                        {eventGroup.children.length > 0 && (
                          <div className="sm:ml-4 sm:pl-3">
                            {eventGroup.children.map((child) => (
                              <RecentActivityRow
                                key={child.id}
                                event={child}
                                serverUrl={resolveMcpUsageServerUrl(child, connections) ?? undefined}
                                isChild
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              ))
            )}
          </div>

          <div className="flex flex-col gap-3 border-t border-red-500/20 px-1 py-3 dark:border-red-400/20 sm:flex-row sm:items-center sm:justify-between sm:px-4">
            <p className="text-xs text-muted-foreground">
              Showing {groups.length === 0 ? 0 : (currentPage - 1) * RECENT_ACTIVITY_PAGE_SIZE + 1}-{Math.min(
                currentPage * RECENT_ACTIVITY_PAGE_SIZE,
                totalCount
              )} of {totalCount}
            </p>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
              <button
                type="button"
                className="inline-flex h-9 min-w-full items-center justify-center rounded-md border border-red-500/20 px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-400/20 sm:min-w-0"
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage <= 1 || isFetching}
              >
                Previous
              </button>
              <button
                type="button"
                className="inline-flex h-9 min-w-full items-center justify-center rounded-md border border-red-500/20 px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-400/20 sm:min-w-0"
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage * RECENT_ACTIVITY_PAGE_SIZE >= totalCount || isFetching}
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



function groupRecentGroupsByDate(groups: McpToolCallEventGroup[]) {
  const todayKey = getLocalDateKey(new Date());
  const dateGroups: Array<{
    dateKey: string;
    label: string;
    groups: McpToolCallEventGroup[];
  }> = [];

  for (const group of groups) {
    const dateKey = getLocalDateKey(group.parent.started_at);
    const existing = dateGroups.find((g) => g.dateKey === dateKey);
    if (existing) {
      existing.groups.push(group);
      continue;
    }

    dateGroups.push({
      dateKey,
      label: dateKey === todayKey ? "TODAY" : formatRecentActivityDateLabel(dateKey).toUpperCase(),
      groups: [group],
    });
  }

  return dateGroups;
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
    <div className="min-w-0 rounded-xl bg-muted/10 p-3 sm:bg-transparent sm:p-0">
      <p className="mb-1 text-sm text-muted-foreground">{label}</p>
      <div className="flex items-center gap-2">
        {serverUrl ? (
          <ServerIcon serverName={value} serverUrl={serverUrl} size={20} className="shrink-0" />
        ) : null}
        <p className="min-w-0 max-w-[20rem] truncate text-lg font-semibold tracking-tight sm:text-xl">
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
  isChild,
  childCount,
}: {
  event: McpToolCallEventRow;
  serverUrl?: string;
  isChild?: boolean;
  childCount?: number;
}) {
  const appName = getMcpAppDisplayName(event.app_key, event.server_name);
  const isSuccess = event.status === "success";

  return (
    <div className={cn(
      "grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2 bg-muted/10 p-3 text-sm sm:grid-cols-[6rem_12rem_1fr_5rem_5rem] sm:items-center sm:gap-3 sm:bg-transparent sm:px-4",
      isChild ? "sm:py-2 sm:bg-muted/3" : "sm:py-3"
    )}>
      {isChild ? (
        <div />
      ) : (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Clock3 className="h-4 w-4" />
          <span>{formatTime(event.started_at)}</span>
        </div>
      )}
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
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <p
                className="break-all whitespace-normal font-mono text-xs tracking-tight sm:text-sm text-foreground"
                style={{ wordBreak: "break-all", whiteSpace: "normal" }}
              >
                {event.tool_name}
              </p>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs break-all">
              {event.tool_name}
            </TooltipContent>
          </Tooltip>
          {childCount !== undefined && childCount > 0 && (
            <span className="shrink-0 inline-flex items-center justify-center rounded-full bg-muted-foreground/10 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground leading-none">
              +{childCount}
            </span>
          )}
        </div>
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
        {isSuccess ? (
          <CheckCircle2 className="h-4 w-4" />
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <XCircle className="h-4 w-4 cursor-help" />
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs">
              <div className="space-y-1 text-xs">
                {event.error_code && (
                  <p className="font-mono text-muted-foreground">Code: {event.error_code}</p>
                )}
                <p>{event.error_preview || "Unknown error"}</p>
              </div>
            </TooltipContent>
          </Tooltip>
        )}
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
  if (ratio <= 0.5) return "bg-emerald-300 dark:bg-emerald-800";
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
