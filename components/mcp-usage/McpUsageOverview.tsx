"use client";

import { Fragment, useMemo, useState, useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTheme } from "next-themes";
import { Activity, CheckCircle2, Clock3, XCircle } from "lucide-react";
import { ServerIcon } from "@/components/common/ServerIcon";
import { cn } from "@/lib/utils";
import type { McpToolCallEventRow, McpToolCallEventGroup, ServerIcon as McpServerIcon } from "@/lib/mcp-usage";
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

const RECENT_ACTIVITY_PAGE_SIZE = 10;

function ServerActivityIcon({
  icons,
  serverName,
  serverUrl,
  size = 20,
  className = "",
}: {
  icons?: McpServerIcon[] | null;
  serverName: string;
  serverUrl?: string | null;
  size?: number;
  className?: string;
}) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  if (icons && icons.length > 0) {
    const darkIcon = isDark ? icons.find((i) => /dark/i.test(i.src)) : undefined;
    const src = darkIcon?.src ?? icons[0]?.src;
    if (src) {
      return (
        <img
          src={src}
          alt={`${serverName} icon`}
          width={size}
          height={size}
          className={className}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
        />
      );
    }
  }

  return <ServerIcon serverName={serverName} serverUrl={serverUrl} size={size} className={className} />;
}

interface McpUsageOverviewProps {
  groups: McpToolCallEventGroup[];
  metricsEvents: McpToolCallEventRow[];
  totalCount: number;
  currentPage: number;
  onPageChange?: (newPage: number) => void;
  isFetching?: boolean;
  days?: number;
  healthStatus?: string;
  healthData?: any;
}

export function McpUsageOverview({
  groups,
  metricsEvents,
  totalCount,
  currentPage,
  onPageChange,
  isFetching,
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

  // Compute 52 weeks (364 days) or container-matched columns
  const daysToShow = useMemo(() => {
    if (containerWidth <= 0) return 364;
    const availableWidth = containerWidth - 16;
    const columns = Math.max(26, Math.floor((availableWidth + 4) / 16));
    return Math.min(365, columns * 7);
  }, [containerWidth]);

  const summary = summarizeMcpUsage(metricsEvents);
  const heatmap = buildMcpUsageHeatmap(metricsEvents, daysToShow, new Date());
  const maxCount = heatmap.reduce((m, d) => Math.max(m, d.count), 0);
  const recentEventGroups = useMemo(() => groupRecentGroupsByDate(groups), [groups]);

  const mostUsedAppName = summary.mostUsedApp?.name ?? "MCP Hub";
  const mostUsedAppEvent = summary.mostUsedApp
    ? metricsEvents.find((event) => getUsageEventKey(event) === summary.mostUsedApp?.key)
    : undefined;
  const mostUsedAppServerUrl = mostUsedAppEvent
    ? resolveMcpUsageServerUrl(mostUsedAppEvent) ?? undefined
    : undefined;

  const handlePageChange = (newPage: number) => {
    if (onPageChange) {
      onPageChange(newPage);
      return;
    }
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("page", newPage.toString());
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  return (
    <div className="space-y-6">
      {/* 1. Main Heatmap & Telemetry Card */}
      <div className="bg-card border border-border rounded-md p-5 sm:p-6 space-y-6">
        {/* Full-width Heatmap Grid */}
        <div ref={containerRef} className="overflow-x-auto pb-1 scrollbar-minimal">
          <TooltipProvider delayDuration={100}>
            <div className="grid min-w-max grid-flow-col grid-rows-7 justify-start gap-[4px] sm:gap-[5px]">
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
                          "h-[12px] w-[12px] sm:h-[13px] sm:w-[13px] rounded-[2px] cursor-default transition-colors",
                          getHeatmapColorClass(day.count, maxCount)
                        )}
                      />
                    </TooltipTrigger>
                    <TooltipContent
                      side="top"
                      sideOffset={6}
                      className="z-[300] w-56 p-0 overflow-hidden bg-card text-foreground border border-border shadow-md rounded-md"
                      avoidCollisions={true}
                      collisionPadding={8}
                    >
                      <div className="px-3 py-2">
                        <div className="flex items-center justify-between gap-3 border-b border-border pb-1.5 text-xs font-mono">
                          <span className="font-medium text-foreground">{formatTooltipDate(day.date)}</span>
                          <span className="text-muted-foreground">{day.count} calls</span>
                        </div>
                        <div className="mt-2 space-y-1">
                          {tooltipItems.length > 0 ? (
                            <>
                              {tooltipItems.map((app) => (
                                <div key={`${day.date}-${app.key}`} className="flex items-center gap-2 text-xs">
                                  <ServerActivityIcon
                                    icons={app.serverIcons}
                                    serverName={app.name}
                                    serverUrl={app.serverUrl}
                                    size={14}
                                    className="shrink-0 rounded-xs"
                                  />
                                  <span className="min-w-0 flex-1 truncate text-foreground">{app.name}</span>
                                  <span className="shrink-0 font-mono text-muted-foreground">{app.count}</span>
                                </div>
                              ))}
                              {otherCount > 0 ? (
                                <div className="flex items-center gap-2 text-xs">
                                  <div className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-xs bg-background text-[9px] font-mono text-muted-foreground border border-border">
                                    +
                                  </div>
                                  <span className="min-w-0 flex-1 truncate text-muted-foreground">
                                    {otherCount} other{otherCount === 1 ? "" : "s"}
                                  </span>
                                  <span className="shrink-0 font-mono text-muted-foreground">{otherToolCalls}</span>
                                </div>
                              ) : null}
                            </>
                          ) : (
                            <p className="text-xs text-muted-foreground font-mono">No tool calls</p>
                          )}
                        </div>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          </TooltipProvider>
        </div>

        {/* Integrated Metric Strip */}
        <div className="grid grid-cols-3 gap-4 pt-5 border-t border-border/60">
          <div className="space-y-1">
            <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
              Tool Calls
            </p>
            <p className="text-2xl font-semibold font-mono text-foreground">
              {summary.toolCallsTotal.toLocaleString()}
            </p>
          </div>

          <div className="space-y-1">
            <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
              Streak
            </p>
            <p className="text-2xl font-semibold font-mono text-foreground flex items-center gap-1.5">
              <span>{summary.streakDays}</span>
              <span className="text-xs font-normal text-muted-foreground">Days</span>
            </p>
          </div>

          <div className="space-y-1">
            <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
              Most Used App
            </p>
            <p className="text-lg sm:text-xl font-medium text-foreground truncate flex items-center gap-2">
              <ServerIcon serverName={mostUsedAppName} serverUrl={mostUsedAppServerUrl} size={20} className="shrink-0 rounded-xs" />
              <span className="truncate">{mostUsedAppName}</span>
            </p>
          </div>
        </div>
      </div>

      {/* 2. Recent Activity Log List */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 px-1">
          <Activity className="size-3.5 text-muted-foreground" />
          <h3 className="text-xs font-mono uppercase tracking-wider text-muted-foreground font-semibold">
            Recent Activity
          </h3>
        </div>

        {recentEventGroups.length > 0 ? (
          <div className="bg-card border border-border rounded-md overflow-hidden">
            <div className="divide-y divide-border/60">
              {recentEventGroups.map((dateGroup) => (
                <div key={dateGroup.dateKey} className="divide-y divide-border/40">
                  <div className="px-4 py-2 bg-background/50 text-[11px] font-mono uppercase tracking-wider text-muted-foreground/80 font-semibold">
                    {dateGroup.label}
                  </div>
                  {dateGroup.groups.map((eventGroup) => (
                    <Fragment key={eventGroup.parent.id}>
                      <RecentActivityRow
                        event={eventGroup.parent}
                        serverUrl={resolveMcpUsageServerUrl(eventGroup.parent) ?? undefined}
                        childCount={eventGroup.children.length}
                      />
                      {eventGroup.children.length > 0 &&
                        eventGroup.children.map((child) => (
                          <RecentActivityRow
                            key={child.id}
                            event={child}
                            serverUrl={resolveMcpUsageServerUrl(child) ?? undefined}
                            isChild
                          />
                        ))}
                    </Fragment>
                  ))}
                </div>
              ))}
            </div>

            {/* Pagination footer */}
            <div className="flex flex-col gap-3 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between bg-card">
              <p className="text-xs font-mono text-muted-foreground">
                Showing {groups.length === 0 ? 0 : (currentPage - 1) * RECENT_ACTIVITY_PAGE_SIZE + 1}-{Math.min(
                  currentPage * RECENT_ACTIVITY_PAGE_SIZE,
                  totalCount
                )} of {totalCount}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="inline-flex h-8 items-center justify-center rounded-sm border border-border bg-background px-3 text-xs font-medium text-foreground transition-colors hover:bg-card/80 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage <= 1 || isFetching}
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="inline-flex h-8 items-center justify-center rounded-sm border border-border bg-background px-3 text-xs font-medium text-foreground transition-colors hover:bg-card/80 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage * RECENT_ACTIVITY_PAGE_SIZE >= totalCount || isFetching}
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-card border border-border rounded-md p-6 text-center space-y-1">
            <p className="text-xs font-mono text-muted-foreground">
              No recent tool executions recorded yet.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function RecentActivityRow({
  event,
  serverUrl,
  childCount,
  isChild = false,
}: {
  event: McpToolCallEventRow;
  serverUrl?: string;
  childCount?: number;
  isChild?: boolean;
}) {
  const appName = getMcpAppDisplayName(event.app_key, event.server_name);
  const isSuccess = event.status === "success";

  return (
    <div
      className={cn(
        "grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[5.5rem_11rem_1fr_4.5rem_4rem] items-center gap-3 px-4 py-2.5 text-xs font-sans hover:bg-background/40 transition-colors",
        isChild && "bg-background/20"
      )}
    >
      <div className="flex items-center gap-1.5 text-muted-foreground font-mono text-[11px]">
        <Clock3 className="size-3.5 shrink-0" />
        <span>{formatTime(event.started_at)}</span>
      </div>

      <div className="flex min-w-0 items-center gap-2">
        <ServerIcon serverName={appName} serverUrl={serverUrl} size={18} className="shrink-0 rounded-xs" />
        {event.server_id || serverUrl ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="truncate font-medium text-foreground cursor-help">{appName}</span>
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
          <span className="truncate font-medium text-foreground">{appName}</span>
        )}
      </div>

      <div className="min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <Tooltip>
            <TooltipTrigger asChild>
              <p className="truncate font-mono text-[11px] font-medium text-foreground">
                {event.tool_name}
              </p>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs break-all">
              {event.tool_name}
            </TooltipContent>
          </Tooltip>
          {childCount !== undefined && childCount > 0 ? (
            <span className="shrink-0 inline-flex items-center justify-center rounded-full bg-muted-foreground/15 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground leading-none">
              +{childCount}
            </span>
          ) : null}
        </div>
        {!isSuccess && event.error_preview ? (
          <p className="mt-0.5 line-clamp-1 text-[11px] text-destructive font-mono">
            {event.error_preview}
          </p>
        ) : null}
      </div>

      <div className="text-right font-mono text-[11px] text-muted-foreground">
        {formatDuration(event.duration_ms)}
      </div>

      <div className="flex items-center justify-end gap-1 text-right">
        {isSuccess ? (
          <>
            <CheckCircle2 className="size-3.5 text-emerald-400 shrink-0" />
            <span className="font-mono text-[10px] font-medium text-emerald-400">
              OK
            </span>
          </>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1 cursor-help">
                <XCircle className="size-3.5 text-rose-400 shrink-0" />
                <span className="font-mono text-[10px] font-medium text-rose-400">
                  Error
                </span>
              </div>
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
      </div>
    </div>
  );
}

function getHeatmapColorClass(count: number, maxCount: number): string {
  if (count <= 0 || maxCount <= 0) return "bg-border/50 dark:bg-border/30";
  const ratio = count / maxCount;
  if (ratio <= 0.25) return "bg-emerald-300 dark:bg-emerald-950";
  if (ratio <= 0.5) return "bg-emerald-400 dark:bg-emerald-800";
  if (ratio <= 0.75) return "bg-emerald-500 dark:bg-emerald-600";
  return "bg-emerald-600 dark:bg-emerald-400";
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
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

function groupRecentGroupsByDate(groups: McpToolCallEventGroup[]) {
  const dateMap = new Map<string, { label: string; groups: McpToolCallEventGroup[] }>();
  for (const group of groups) {
    const dateKey = getLocalDateKey(group.parent.started_at);
    if (!dateMap.has(dateKey)) {
      const date = new Date(group.parent.started_at);
      const label = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(date);
      dateMap.set(dateKey, { label, groups: [] });
    }
    dateMap.get(dateKey)!.groups.push(group);
  }
  return Array.from(dateMap.entries()).map(([dateKey, val]) => ({
    dateKey,
    label: val.label,
    groups: val.groups,
  }));
}

function getUsageEventKey(event: Pick<McpToolCallEventRow, "app_key" | "server_id" | "server_name">) {
  return normalizeValue(event.app_key) || normalizeValue(event.server_id) || normalizeValue(event.server_name) || "mcp_server";
}

function normalizeValue(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return normalized || null;
}
