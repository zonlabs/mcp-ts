"use client";

import { PanelLeft } from "lucide-react";
import { useMemo, useState } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createOAuthPopupRedirectHandler, useMcp } from "@mcp-ts/sdk/client/react";
import HomeChat from "./HomeChat";
import McpSidebar from "./McpSidebar";

export default function HomePage() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const handleOAuthRedirect = useMemo(
    () => createOAuthPopupRedirectHandler(),
    [],
  );

  // ── Single source of truth for the MCP client ──────────────────────────
  const mcpClient = useMcp({
    url: "/api/mcp",
    userId: process.env.NEXT_PUBLIC_MCP_USER_ID!,
    autoConnect: true,
    autoInitialize: true,
    onRedirect: handleOAuthRedirect,
  });

  return (
    <TooltipProvider>
      <div className="relative flex h-[100dvh] min-h-0 w-full overflow-hidden bg-background">
        {sidebarOpen ? (
          <button
            type="button"
            aria-label="Close MCP panel"
            className="fixed inset-0 z-40 bg-background/60 backdrop-blur-[2px] md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        ) : null}

        <div
          className={cn(
            "relative z-50 flex h-full shrink-0 overflow-hidden border-r border-border/80 bg-sidebar transition-[width] duration-200 ease-out",
            sidebarOpen ? "w-[min(100vw,400px)]" : "w-0 border-r-0",
          )}
        >
          <div className="flex h-full w-[min(100vw,400px)] min-w-[min(100vw,400px)] flex-col">
            {/* Sidebar only handles connection management — no McpAppRenderer */}
            <McpSidebar
              mcpClient={mcpClient}
              onCollapse={() => setSidebarOpen(false)}
            />
          </div>
        </div>

        <main className="relative z-10 flex min-h-0 min-w-0 flex-1 flex-col">
          {!sidebarOpen ? (
            <div className="flex shrink-0 items-center gap-2 border-b border-border px-2 py-1.5">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => setSidebarOpen(true)}
                aria-label="Open MCP panel"
              >
                <PanelLeft className="size-4" />
              </Button>
              <span className="text-muted-foreground text-xs">
                MCP panel hidden
              </span>
            </div>
          ) : null}
          {/* Chat renders MCP Apps inline after tool calls */}
          <HomeChat
            className="min-h-0 flex-1"
            mcpClient={mcpClient}
          />
        </main>
      </div>
    </TooltipProvider>
  );
}
