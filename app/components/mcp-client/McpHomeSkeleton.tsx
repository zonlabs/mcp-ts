import React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Loading skeleton for the MCP Home tab.
 * Reflects the complete visual layout: Welcome header, Heatmap & telemetry card,
 * standalone MCP server card, and popular connector card grid.
 */
export function McpHomeSkeleton() {
  return (
    <div className="flex-1 overflow-y-auto bg-background text-foreground scrollbar-minimal w-full">
      <div className="p-6 sm:p-8 space-y-8 max-w-6xl mx-auto w-full">
        {/* 1. Welcome Header Skeleton */}
        <div className="space-y-2">
          <Skeleton className="h-8 sm:h-9 w-60 sm:w-80 rounded-md" />
          <Skeleton className="h-3.5 w-44 rounded-xs" />
        </div>

        {/* 2. Main Heatmap & Telemetry Card Skeleton */}
        <div className="bg-card border border-border rounded-md p-3 sm:p-3.5 space-y-2.5">
          {/* Full-width Heatmap Grid Skeleton */}
          <div className="overflow-x-auto scrollbar-minimal">
            <div className="grid grid-flow-col grid-rows-7 gap-[3px] sm:gap-[4px] w-full min-w-max justify-between">
              {Array.from({ length: 364 }).map((_, i) => (
                <div
                  key={i}
                  className="h-[12px] w-[12px] sm:h-[13px] sm:w-[13px] rounded-[2px] bg-muted/40 animate-pulse"
                  style={{ animationDelay: `${(i % 50) * 15}ms` }}
                />
              ))}
            </div>
          </div>

          {/* Metric Strip Skeleton */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 pt-0.5">
            {[
              { labelWidth: "w-16", valueWidth: "w-20" },
              { labelWidth: "w-12", valueWidth: "w-16" },
              { labelWidth: "w-12", valueWidth: "w-14" },
              { labelWidth: "w-20", valueWidth: "w-28" },
            ].map((metric, idx) => (
              <div key={idx} className="space-y-1 min-w-0">
                <Skeleton className={cn("h-2 rounded-xs", metric.labelWidth)} />
                <Skeleton className={cn("h-4 sm:h-5 rounded-sm", metric.valueWidth)} />
              </div>
            ))}
          </div>
        </div>

        {/* 3. Standalone MCP Server Card Skeleton */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 px-1">
            <Skeleton className="size-3.5 rounded-xs" />
            <Skeleton className="h-3.5 w-28 rounded-xs" />
          </div>

          <div className="bg-card border border-border rounded-md p-5 space-y-4">
            <div className="flex items-center justify-between gap-4 flex-wrap sm:flex-nowrap">
              <div className="flex items-center gap-3 min-w-0">
                <Skeleton className="size-9 rounded-sm shrink-0" />
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-4 w-20 rounded-xs" />
                    <Skeleton className="h-3.5 w-16 rounded-full" />
                  </div>
                  <Skeleton className="h-3 w-40 rounded-xs" />
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {[...Array(4)].map((_, i) => (
                  <Skeleton key={i} className="size-7 rounded-sm" />
                ))}
              </div>
            </div>

            <Skeleton className="h-3.5 w-full max-w-xl rounded-xs" />

            <div className="flex items-center justify-between gap-3 rounded-sm border border-border bg-background px-3 py-2">
              <Skeleton className="h-3.5 w-48 rounded-xs" />
              <Skeleton className="size-5 rounded-xs" />
            </div>
          </div>
        </div>

        {/* 4. Popular Connectors & Apps Skeleton */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Skeleton className="size-4 rounded-xs" />
                <Skeleton className="h-5 w-48 rounded-xs" />
              </div>
              <Skeleton className="h-3 w-64 rounded-xs" />
            </div>
            <Skeleton className="h-4 w-24 rounded-xs" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {[...Array(6)].map((_, idx) => (
              <div
                key={idx}
                className="bg-card border border-border rounded-md p-4 flex items-start gap-3.5"
              >
                <Skeleton className="size-9 rounded-sm shrink-0" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-28 rounded-xs" />
                  <Skeleton className="h-3 w-full rounded-xs" />
                  <Skeleton className="h-3 w-4/5 rounded-xs" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
