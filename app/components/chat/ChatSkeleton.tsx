import React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Chat skeleton reflecting the actual PlaygroundChat layout:
 * - Conversational message stream with user bubbles and assistant response blocks
 * - Chain-of-thought indicator and code artifact blocks
 * - ChatInput footer skeleton mirroring model selector, plus button, and send action
 */
export function ChatSkeleton() {
  const chatContentWidthClass = "w-full max-w-2xl mx-auto px-4 sm:px-6";

  return (
    <div className="flex flex-col h-full w-full flex-1 min-h-0 bg-background overflow-hidden relative">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 scrollbar-minimal">
        <div className={cn(chatContentWidthClass, "py-6 sm:py-8 space-y-6 sm:space-y-7")}>
          {/* 1. User Message (right-aligned bubble) */}
          <div className="flex justify-end">
            <div className="w-full max-w-[80%] sm:max-w-[420px] p-3.5 sm:p-4 rounded-2xl rounded-br-sm bg-secondary/50 border border-border/60 space-y-2">
              <Skeleton className="h-3.5 w-full rounded-xs" />
              <Skeleton className="h-3.5 w-3/5 rounded-xs" />
            </div>
          </div>

          {/* 2. Assistant Response (left-aligned) */}
          <div className="space-y-3.5 max-w-[95%]">
            {/* Thinking / Chain-of-thought pill skeleton */}
            <div className="flex items-center gap-2">
              <Skeleton className="size-3.5 rounded-full" />
              <Skeleton className="h-4 w-28 rounded-full" />
            </div>

            {/* Paragraph lines */}
            <div className="space-y-2">
              <Skeleton className="h-3.5 w-full rounded-xs" />
              <Skeleton className="h-3.5 w-[92%] rounded-xs" />
              <Skeleton className="h-3.5 w-[85%] rounded-xs" />
              <Skeleton className="h-3.5 w-[65%] rounded-xs" />
            </div>

            {/* Code / Block artifact skeleton */}
            <div className="p-3.5 rounded-lg border border-border/60 bg-card/60 space-y-2.5">
              <div className="flex items-center justify-between border-b border-border/40 pb-2">
                <Skeleton className="h-3 w-20 rounded-xs" />
                <Skeleton className="h-3 w-10 rounded-xs" />
              </div>
              <Skeleton className="h-3 w-3/4 rounded-xs" />
              <Skeleton className="h-3 w-1/2 rounded-xs" />
            </div>
          </div>

          {/* 3. Second User Message (right-aligned bubble) */}
          <div className="flex justify-end">
            <div className="w-full max-w-[65%] sm:max-w-[320px] p-3.5 rounded-2xl rounded-br-sm bg-secondary/50 border border-border/60 space-y-2">
              <Skeleton className="h-3.5 w-full rounded-xs" />
              <Skeleton className="h-3.5 w-2/5 rounded-xs" />
            </div>
          </div>

          {/* 4. Second Assistant Response */}
          <div className="space-y-2.5 max-w-[90%]">
            <Skeleton className="h-3.5 w-full rounded-xs" />
            <Skeleton className="h-3.5 w-[88%] rounded-xs" />
            <Skeleton className="h-3.5 w-[70%] rounded-xs" />
          </div>
        </div>
      </div>

      {/* ChatInput skeleton footer matching real ChatInput */}
      <div className="sticky bottom-0 bg-gradient-to-t from-background via-background to-transparent pt-2 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] sm:pb-8 w-full flex justify-center">
        <div className={chatContentWidthClass}>
          <div className="w-full bg-card rounded-sm border border-border p-3 space-y-3.5 shadow-xs">
            {/* Input placeholder */}
            <div className="pt-0.5">
              <Skeleton className="h-4 w-44 sm:w-56 rounded-xs" />
            </div>

            {/* Action Row */}
            <div className="flex items-center justify-between gap-2 pt-1">
              {/* Left tools: Plus button + Model selector pill */}
              <div className="flex items-center gap-2">
                <Skeleton className="size-7 sm:size-8 rounded-full shrink-0" />
                <Skeleton className="h-7 w-28 sm:w-36 rounded-md" />
              </div>

              {/* Right tools: Send button */}
              <div className="flex items-center gap-1.5 shrink-0">
                <Skeleton className="size-7 sm:size-8 rounded-full" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
