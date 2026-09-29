import React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function ProjectWorkspaceSkeleton() {
  return (
    <div className="flex-1 h-full min-h-0 overflow-y-auto">
      <div className="w-full max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-10 font-sans space-y-6 pb-24">
        {/* Top Header Row: Folder icon + Title ... Share + Options buttons */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <Skeleton className="size-6 sm:size-7 rounded-sm shrink-0" />
            <Skeleton className="h-7 sm:h-8 w-44 sm:w-60 rounded-md" />
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Skeleton className="h-7 w-16 rounded-sm" />
            <Skeleton className="size-8 rounded-sm" />
          </div>
        </div>

        {/* Input Bar Skeleton */}
        <div className="w-full">
          <div className="bg-card rounded-md border border-border p-3 space-y-4">
            <Skeleton className="h-4 w-48 sm:w-60 rounded-xs mt-1" />
            <div className="flex items-center justify-between pt-2">
              <div className="flex items-center gap-2">
                <Skeleton className="size-7 rounded-full" />
                <Skeleton className="h-7 w-28 rounded-md" />
              </div>
              <Skeleton className="size-7 rounded-full" />
            </div>
          </div>
        </div>

        {/* Pill Tabs: Chats | Sources | Settings */}
        <div className="flex items-center gap-2 pt-1 border-b border-border/40 pb-3">
          <Skeleton className="h-7 w-16 rounded-sm" />
          <Skeleton className="h-7 w-24 rounded-sm" />
          <Skeleton className="h-7 w-20 rounded-sm" />
        </div>

        {/* Chats List Skeleton */}
        <div className="space-y-0.5 pt-1">
          {[
            { titleWidth: "w-2/5", timeWidth: "w-16" },
            { titleWidth: "w-3/5", timeWidth: "w-24" },
            { titleWidth: "w-1/2", timeWidth: "w-20" },
            { titleWidth: "w-1/3", timeWidth: "w-14" },
          ].map((item, idx) => (
            <div key={idx} className="py-3 px-3 -mx-3 rounded-sm space-y-2">
              <div className="flex items-center justify-between gap-4">
                <Skeleton className={cn("h-4 rounded-xs", item.titleWidth)} />
                <Skeleton className="h-3 w-12 rounded-xs shrink-0" />
              </div>
              <Skeleton className={cn("h-3 rounded-xs", item.timeWidth)} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
