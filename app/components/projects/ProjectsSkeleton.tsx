import React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function ProjectsSkeleton() {
  return (
    <div className="flex-1 h-full min-h-0 overflow-y-auto">
      <div className="w-full max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-10 font-sans space-y-6 pb-24">
        {/* Top Header Row: Folder icon + "Projects" ... "New Project" button */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <Skeleton className="size-6 sm:size-7 rounded-sm shrink-0" />
            <Skeleton className="h-7 sm:h-8 w-32 sm:w-40 rounded-md" />
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Skeleton className="h-8.5 w-28 rounded-md" />
          </div>
        </div>

        {/* Pill Tabs + Search Filter */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1 border-b border-border/40 pb-3">
          <div className="flex items-center gap-2">
            <Skeleton className="h-7 w-16 rounded-sm" />
            <Skeleton className="h-7 w-28 rounded-sm" />
            <Skeleton className="h-7 w-20 rounded-sm" />
          </div>
          <Skeleton className="h-8 w-full sm:w-52 rounded-md" />
        </div>

        {/* Projects List Skeleton */}
        <div className="space-y-0.5 pt-1">
          {[
            { nameWidth: "w-44", descWidth: "w-72", updatedWidth: "w-24", badge: true },
            { nameWidth: "w-56", descWidth: "w-80", updatedWidth: "w-28", badge: false },
            { nameWidth: "w-36", descWidth: "w-60", updatedWidth: "w-20", badge: true },
            { nameWidth: "w-48", descWidth: "w-64", updatedWidth: "w-24", badge: false },
          ].map((item, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between py-3 px-3 -mx-3 rounded-sm"
            >
              <div className="flex-1 min-w-0 pr-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Skeleton className={cn("h-4 rounded-xs", item.nameWidth)} />
                  {item.badge && <Skeleton className="h-4 w-12 rounded-full" />}
                </div>
                <Skeleton className={cn("h-3 rounded-xs", item.descWidth)} />
                <div className="flex items-center gap-3">
                  <Skeleton className={cn("h-3 rounded-xs", item.updatedWidth)} />
                  <Skeleton className="h-3 w-16 rounded-xs" />
                </div>
              </div>

              <Skeleton className="size-8 rounded-sm shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
