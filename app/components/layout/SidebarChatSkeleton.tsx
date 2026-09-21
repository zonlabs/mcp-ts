import React from "react";
import { cn } from "@/lib/utils";

interface SidebarChatSkeletonProps {
  count?: number;
  className?: string;
}

export function SidebarChatSkeleton({
  count = 6,
  className,
}: SidebarChatSkeletonProps) {
  return (
    <div
      className={cn("space-y-0.5 py-0.5", className)}
      aria-label="Loading chats"
      aria-busy="true"
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="px-2 py-1.5 rounded-sm space-y-1.5 select-none">
          <div
            className="h-3 bg-sidebar-foreground/10 rounded-xs animate-pulse"
            style={{ width: `${60 + ((i * 17) % 30)}%` }}
          />
          <div className="h-2 w-14 bg-sidebar-foreground/5 rounded-xs animate-pulse" />
        </div>
      ))}
    </div>
  );
}
