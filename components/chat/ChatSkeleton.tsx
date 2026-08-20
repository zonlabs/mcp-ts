import React from "react";
import { Skeleton } from "@/components/ui/skeleton";

export function ChatSkeleton() {
  return (
    <div className="flex flex-col h-full w-full flex-1 min-h-0 bg-background animate-in fade-in duration-300">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 sm:py-8 max-w-2xl w-full mx-auto space-y-7">
        {/* 1. Starts with User prompt message skeleton (right-aligned) */}
        <div className="flex justify-end">
          <div className="w-full max-w-[75%] sm:max-w-[440px] p-3 rounded-md bg-card border border-border space-y-2">
            <Skeleton className="h-3.5 w-full rounded-xs" />
            <Skeleton className="h-3.5 w-4/5 rounded-xs" />
          </div>
        </div>

        {/* 2. Assistant response skeleton (left-aligned) */}
        <div className="space-y-3">
          <div className="space-y-2.5">
            <Skeleton className="h-3.5 w-full rounded-sm" />
            <Skeleton className="h-3.5 w-11/12 rounded-sm" />
            <Skeleton className="h-3.5 w-4/5 rounded-sm" />
            <Skeleton className="h-3.5 w-2/3 rounded-sm" />
          </div>
        </div>

        {/* 3. Second User prompt message skeleton */}
        <div className="flex justify-end">
          <div className="w-full max-w-[65%] sm:max-w-[360px] p-3 rounded-md bg-card border border-border space-y-2">
            <Skeleton className="h-3.5 w-full rounded-xs" />
          </div>
        </div>

        {/* 4. Second Assistant response skeleton */}
        <div className="space-y-3">
          <div className="space-y-2.5">
            <Skeleton className="h-3.5 w-full rounded-sm" />
            <Skeleton className="h-3.5 w-5/6 rounded-sm" />
            <Skeleton className="h-16 w-full rounded-sm" />
          </div>
        </div>
      </div>

      {/* ChatInput skeleton footer */}
      <div className="p-4 max-w-2xl w-full mx-auto">
        <div className="h-14 w-full rounded-md border border-border bg-card p-3 flex items-center justify-between">
          <Skeleton className="h-4 w-36 rounded-xs" />
          <Skeleton className="h-7 w-7 rounded-sm" />
        </div>
      </div>
    </div>
  );
}
