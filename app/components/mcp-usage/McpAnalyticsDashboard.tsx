"use client";

import { useMemo, useState } from "react";
import { useTheme } from "next-themes";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock,
  Cpu,
  Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { McpToolCallEventRow, ServerIcon as McpServerIcon } from "@/lib/mcp-usage";
import { computeMcpAnalytics } from "@/lib/mcp-usage";
import { ServerIcon } from "@/components/common/ServerIcon";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface McpAnalyticsDashboardProps {
  events: McpToolCallEventRow[];
}

function AnalyticsServerIcon({
  icons,
  serverName,
  serverUrl,
  size = 18,
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
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
      );
    }
  }

  return <ServerIcon serverName={serverName} serverUrl={serverUrl} size={size} className={className} />;
}

function formatDuration(ms: number) {
  if (ms <= 0) return "<1ms";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

export function McpAnalyticsDashboard({ events }: McpAnalyticsDashboardProps) {
  const analytics = useMemo(() => computeMcpAnalytics(events), [events]);
  const [hoveredHour, setHoveredHour] = useState<number | null>(null);

  const { latency, reliability, distribution, hourlyActivity } = analytics;

  return (
    <TooltipProvider delayDuration={100}>
      <div className="space-y-4">
        {/* Section Header */}
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <BarChart3 className="size-4 text-muted-foreground" />
            <h3 className="text-xs sm:text-sm font-mono uppercase tracking-wider text-muted-foreground font-semibold">
              Telemetry & Insights
            </h3>
          </div>
          <span className="text-xs font-mono text-muted-foreground">
            {events.length} event{events.length === 1 ? "" : "s"} aggregated
          </span>
        </div>

        {/* 1. Quick KPI Cards Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {/* Latency Avg & P95 */}
          <div className="bg-card border border-border rounded-md p-4 space-y-1">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-[10px] sm:text-xs font-mono uppercase tracking-wider font-semibold">
                Avg Latency
              </span>
              <Clock className="size-3.5 text-muted-foreground" />
            </div>
            <p className="text-xl sm:text-2xl font-semibold font-mono text-foreground tracking-tight">
              {formatDuration(latency.avgDurationMs)}
            </p>
            <p className="text-[11px] font-mono text-muted-foreground">
              P95: <span className="text-foreground">{formatDuration(latency.p95DurationMs)}</span> · P50:{" "}
              <span className="text-foreground">{formatDuration(latency.p50DurationMs)}</span>
            </p>
          </div>

          {/* Success Rate */}
          <div className="bg-card border border-border rounded-md p-4 space-y-1">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-[10px] sm:text-xs font-mono uppercase tracking-wider font-semibold">
                Success Rate
              </span>
              <CheckCircle2
                className={cn(
                  "size-3.5",
                  reliability.successRate >= 95
                    ? "text-emerald-500"
                    : reliability.successRate >= 80
                    ? "text-amber-500"
                    : "text-rose-500"
                )}
              />
            </div>
            <p className="text-xl sm:text-2xl font-semibold font-mono text-foreground tracking-tight">
              {reliability.successRate}%
            </p>
            <p className="text-[11px] font-mono text-muted-foreground">
              {reliability.successCount} success · {reliability.errorCount} error{reliability.errorCount === 1 ? "" : "s"}
            </p>
          </div>

          {/* Orchestration Ratio */}
          <div className="bg-card border border-border rounded-md p-4 space-y-1">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-[10px] sm:text-xs font-mono uppercase tracking-wider font-semibold">
                Orchestration
              </span>
              <Layers className="size-3.5 text-muted-foreground" />
            </div>
            <p className="text-xl sm:text-2xl font-semibold font-mono text-foreground tracking-tight">
              {distribution.orchestrationRatio}%
            </p>
            <p className="text-[11px] font-mono text-muted-foreground">
              {distribution.downstreamCount} sub-calls · {distribution.topLevelCount} top-level
            </p>
          </div>

          {/* Active Ecosystem */}
          <div className="bg-card border border-border rounded-md p-4 space-y-1">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-[10px] sm:text-xs font-mono uppercase tracking-wider font-semibold">
                Connected Services
              </span>
              <Cpu className="size-3.5 text-muted-foreground" />
            </div>
            <p className="text-xl sm:text-2xl font-semibold font-mono text-foreground tracking-tight">
              {distribution.apps.length}
            </p>
            <p className="text-[11px] font-mono text-muted-foreground truncate">
              {distribution.apps.slice(0, 2).map((a) => a.name).join(", ") || "No services"}
            </p>
          </div>
        </div>

        {/* 2. Middle Row: Most In-Demand Tools & Diagnostics & Health */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Most In-Demand Tools (with App Icons) */}
          <div className="bg-card border border-border rounded-md p-5 space-y-4">
            <div>
              <h4 className="text-xs sm:text-sm font-mono uppercase tracking-wider text-foreground font-semibold">
                Most In-Demand Tools
              </h4>
              <p className="text-xs text-muted-foreground font-sans">
                Most frequently invoked MCP functions
              </p>
            </div>

            {distribution.topTools.length > 0 ? (
              <div className="space-y-3.5">
                {distribution.topTools.map((t, idx) => (
                  <div key={`${t.appDisplayName}-${t.toolName}`} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className="font-mono text-[11px] text-muted-foreground w-3.5 shrink-0">
                          {idx + 1}.
                        </span>
                        <div className="size-6 shrink-0 flex items-center justify-center rounded-sm bg-background border border-border dark:bg-white dark:border-white/20 p-0.5 shadow-2xs">
                          <AnalyticsServerIcon
                            icons={t.serverIcons}
                            serverName={t.appDisplayName}
                            serverUrl={t.serverUrl}
                            size={14}
                            className="shrink-0 object-contain rounded-xs"
                          />
                        </div>
                        <span className="text-muted-foreground truncate">{t.appDisplayName}</span>
                        <span className="font-mono font-medium text-foreground truncate">
                          {t.toolName}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 font-mono text-xs shrink-0">
                        <span className="text-muted-foreground">{t.count} calls</span>
                        <span className="font-semibold text-foreground w-8 text-right">
                          {t.percentage}%
                        </span>
                      </div>
                    </div>
                    <div className="h-1.5 w-full bg-muted/60 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-sky-500 rounded-full transition-all duration-300"
                        style={{ width: `${Math.max(5, t.percentage)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-36 flex flex-col items-center justify-center text-muted-foreground border border-dashed border-border/60 rounded-sm">
                <Activity className="size-6 mb-1 opacity-40" />
                <p className="text-xs font-mono">No tool invocations recorded</p>
              </div>
            )}
          </div>

          {/* Diagnostics & Health */}
          <div className="bg-card border border-border rounded-md p-5 space-y-4">
            <div>
              <h4 className="text-xs sm:text-sm font-mono uppercase tracking-wider text-foreground font-semibold">
                Diagnostics & Health
              </h4>
              <p className="text-xs text-muted-foreground font-sans">
                Error tracking and failure categories
              </p>
            </div>

            {reliability.errorCount === 0 ? (
              <div className="h-36 flex flex-col items-center justify-center text-center p-4 border border-dashed border-emerald-500/30 bg-emerald-500/5 rounded-sm space-y-1">
                <CheckCircle2 className="size-6 text-emerald-500" />
                <p className="text-xs font-mono font-medium text-foreground">100% Operational</p>
                <p className="text-[11px] text-muted-foreground">
                  Zero tool execution errors detected in the current telemetry window.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs text-destructive font-mono">
                  <AlertTriangle className="size-4 shrink-0" />
                  <span>
                    {reliability.errorCount} failed run{reliability.errorCount === 1 ? "" : "s"} (
                    {(100 - reliability.successRate).toFixed(1)}% error rate)
                  </span>
                </div>

                {/* Top Error Codes */}
                <div className="space-y-2 pt-1">
                  <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground font-semibold">
                    Top Error Codes
                  </p>
                  {reliability.topErrors.map((err) => (
                    <div
                      key={err.errorCode}
                      className="bg-muted/40 border border-border/60 rounded-xs p-2 space-y-1"
                    >
                      <div className="flex items-center justify-between text-xs font-mono">
                        <span className="font-semibold text-rose-400 truncate">{err.errorCode}</span>
                        <span className="text-muted-foreground shrink-0">{err.count}x</span>
                      </div>
                      {err.recentPreview && (
                        <p className="text-[11px] font-mono text-muted-foreground line-clamp-1">
                          {err.recentPreview}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 4. Bottom Row: 24-Hour Activity Rhythm (Full Width) */}
        <div className="bg-card border border-border rounded-md p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-xs sm:text-sm font-mono uppercase tracking-wider text-foreground font-semibold">
                24-Hour Activity Rhythm
              </h4>
              <p className="text-xs text-muted-foreground font-sans">
                Distribution of tool calls throughout the day (local time)
              </p>
            </div>
            {hoveredHour !== null && (
              <div className="text-xs font-mono text-foreground bg-muted/60 px-2 py-0.5 rounded-xs">
                {hourlyActivity[hoveredHour].displayLabel}: {hourlyActivity[hoveredHour].count} calls
              </div>
            )}
          </div>

          {/* 24 Histogram Bars */}
          <div className="pt-2">
            <div className="grid grid-cols-[repeat(24,minmax(0,1fr))] gap-[2px] sm:gap-1.5 items-end h-24">
              {hourlyActivity.map((slot) => {
                const hasCalls = slot.count > 0;
                const barHeight = hasCalls ? Math.max(12, slot.percentage) : 4;

                return (
                  <Tooltip key={slot.hour}>
                    <TooltipTrigger asChild>
                      <div
                        onMouseEnter={() => setHoveredHour(slot.hour)}
                        onMouseLeave={() => setHoveredHour(null)}
                        className="w-full flex items-end h-full cursor-default group"
                      >
                        <div
                          className={cn(
                            "w-full rounded-xs transition-colors",
                            hasCalls
                              ? "bg-emerald-500/80 group-hover:bg-emerald-400 dark:bg-emerald-600 dark:group-hover:bg-emerald-400"
                              : "bg-muted/40 group-hover:bg-muted/70"
                          )}
                          style={{ height: `${barHeight}%` }}
                        />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs font-mono p-1.5">
                      <p className="font-semibold">{slot.displayLabel}</p>
                      <p className="text-muted-foreground">{slot.count} calls</p>
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>

            {/* Hour Guides */}
            <div className="flex justify-between pt-2 text-[9px] sm:text-[10px] font-mono text-muted-foreground border-t border-border/50 mt-2">
              <span>12 AM</span>
              <span>04 AM</span>
              <span>08 AM</span>
              <span>12 PM</span>
              <span>04 PM</span>
              <span>08 PM</span>
              <span>11 PM</span>
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
