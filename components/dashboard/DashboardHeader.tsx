"use client";

import React from "react";
import {
  Columns2,
  MessageSquare,
  Wrench,
  Server,
  Sparkles,
  ChevronRight,
  Cpu,
  Radio,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useMcpStore } from "@/lib/stores/mcp-store";
import { ThemeToggle } from "@/components/common/ThemeToggle";
import { ProfileDropdown } from "@/components/common/ProfileDropdown";
import { UserSession } from "@/components/providers/AuthProvider";
import { cn } from "@/lib/utils";

export type DashboardViewMode = "split" | "chat" | "mcp";

interface DashboardHeaderProps {
  viewMode: DashboardViewMode;
  onViewModeChange: (mode: DashboardViewMode) => void;
  session?: UserSession | null;
  activeChatTitle?: string;
}

export function DashboardHeader({
  viewMode,
  onViewModeChange,
  session,
  activeChatTitle,
}: DashboardHeaderProps) {
  const connections = useMcpStore((state) => state.connections);
  const activeConnections = Object.values(connections).filter(
    (conn) => conn.connectionStatus === "CONNECTED" || conn.connectionStatus === "READY"
  );
  const totalToolsCount = activeConnections.reduce(
    (acc, conn) => acc + (conn.tools?.length || 0),
    0
  );

  return (
    <header className="h-12 border-b border-border bg-background px-4 flex items-center justify-between select-none z-20 shrink-0">
      {/* Left: Chat Title & Breadcrumb */}
      <div className="flex items-center gap-2 min-w-0">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono">
          <span className="text-foreground font-medium flex items-center gap-1">
            <Cpu className="size-3.5 text-foreground" />
            workspace
          </span>
          <ChevronRight className="size-3 text-muted-foreground/60" />
        </div>
        {activeChatTitle ? (
          <span className="text-xs font-medium text-foreground truncate max-w-[180px] sm:max-w-[280px]">
            {activeChatTitle}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground truncate">
            New Session
          </span>
        )}
      </div>

      {/* Center: View Switcher (Warp Segmented Controls) */}
      <div className="flex items-center bg-card border border-border p-0.5 rounded-sm">
        <button
          onClick={() => onViewModeChange("chat")}
          className={cn(
            "flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-xs font-medium transition-all",
            viewMode === "chat"
              ? "bg-foreground text-background shadow-xs"
              : "text-muted-foreground hover:text-foreground"
          )}
          title="Chat Only Mode"
        >
          <MessageSquare className="size-3.5" />
          <span className="hidden sm:inline">Chat</span>
        </button>

        <button
          onClick={() => onViewModeChange("split")}
          className={cn(
            "flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-xs font-medium transition-all",
            viewMode === "split"
              ? "bg-foreground text-background shadow-xs"
              : "text-muted-foreground hover:text-foreground"
          )}
          title="Split View (Chat + MCP Tools)"
        >
          <Columns2 className="size-3.5" />
          <span className="hidden sm:inline">Split</span>
        </button>

        <button
          onClick={() => onViewModeChange("mcp")}
          className={cn(
            "flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-xs font-medium transition-all",
            viewMode === "mcp"
              ? "bg-foreground text-background shadow-xs"
              : "text-muted-foreground hover:text-foreground"
          )}
          title="MCP Hub & Tools Explorer"
        >
          <Wrench className="size-3.5" />
          <span className="hidden sm:inline">MCP Tools</span>
        </button>
      </div>

      {/* Right: Live MCP Status Pill & Quick Controls */}
      <div className="flex items-center gap-2">
        <div
          onClick={() => onViewModeChange(viewMode === "mcp" ? "split" : "mcp")}
          className="cursor-pointer group flex items-center gap-1.5 px-2 py-1 bg-card hover:bg-card/80 border border-border rounded-sm transition-colors"
        >
          <span
            className={cn(
              "size-2 rounded-full",
              activeConnections.length > 0
                ? "bg-emerald-500 animate-pulse"
                : "bg-muted-foreground"
            )}
          />
          <span className="text-[11px] font-mono text-muted-foreground group-hover:text-foreground">
            {activeConnections.length} srv · {totalToolsCount} tools
          </span>
        </div>

        <ThemeToggle />
        {session?.user && <ProfileDropdown user={session.user} />}
      </div>
    </header>
  );
}
