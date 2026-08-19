"use client";

import React, { useState, useEffect, type PropsWithChildren, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Toaster } from "react-hot-toast";
import { SettingsSidebar } from "@/components/settings/SettingsSidebar";
import { DashboardHeader, type DashboardViewMode } from "./DashboardHeader";
import { DashboardMcpPanel } from "./DashboardMcpPanel";
import { useAuth } from "@/components/providers/AuthProvider";
import { cn } from "@/lib/utils";

interface UnifiedDashboardLayoutProps extends PropsWithChildren {
  sidebar: ReactNode;
}

export function UnifiedDashboardLayout({
  sidebar,
  children,
}: UnifiedDashboardLayoutProps) {
  const pathname = usePathname();
  const { userSession } = useAuth();
  const showSettingsSidebar = pathname?.startsWith("/settings");

  // Load persisted view mode, defaulting to 'split' on desktop
  const [viewMode, setViewMode] = useState<DashboardViewMode>("split");

  useEffect(() => {
    try {
      const savedMode = localStorage.getItem("mcp_dashboard_view_mode") as DashboardViewMode;
      if (savedMode && (savedMode === "split" || savedMode === "chat" || savedMode === "mcp")) {
        setViewMode(savedMode);
      } else if (window.innerWidth < 1024) {
        setViewMode("chat");
      }
    } catch {
      // ignore
    }
  }, []);

  const handleViewModeChange = (mode: DashboardViewMode) => {
    setViewMode(mode);
    try {
      localStorage.setItem("mcp_dashboard_view_mode", mode);
    } catch {
      // ignore
    }
  };

  // Allow tool insert event into chat input
  const handleInsertPrompt = (text: string) => {
    window.dispatchEvent(new CustomEvent("mcp:insert-prompt", { detail: { text } }));
  };

  return (
    <>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 3000,
          style: {
            background: "#383330",
            color: "#f7f5f0",
            border: "1px solid #3f3a36",
            borderRadius: "4px",
            fontSize: "13px",
            fontFamily: "var(--font-inter), sans-serif",
            boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3)",
          },
        }}
      />
      <div className="flex h-[100dvh] min-h-[100dvh] bg-background text-foreground overflow-hidden">
        {/* App Shell Left Sidebar (Chat History, Servers, Navigation) */}
        {sidebar}

        {showSettingsSidebar ? <SettingsSidebar /> : null}

        {/* Workspace Container */}
        <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden">
          {/* Warp-styled Dashboard Header */}
          <DashboardHeader
            viewMode={viewMode}
            onViewModeChange={handleViewModeChange}
            session={userSession}
          />

          {/* Main Dual-Pane / Workspace Area */}
          <main className="flex-1 flex min-h-0 min-w-0 overflow-hidden relative">
            {/* Chat Pane */}
            <div
              className={cn(
                "h-full flex flex-col min-w-0 transition-all duration-150 overflow-hidden",
                viewMode === "chat" && "w-full flex-1",
                viewMode === "split" && "w-full lg:w-[58%] xl:w-[62%] flex-1 border-r border-border",
                viewMode === "mcp" && "hidden"
              )}
            >
              {children}
            </div>

            {/* MCP Hub & Tools Inspector Pane */}
            <div
              className={cn(
                "h-full flex flex-col transition-all duration-150 overflow-hidden shrink-0",
                viewMode === "mcp" && "w-full flex-1",
                viewMode === "split" && "hidden lg:flex lg:w-[42%] xl:w-[38%]",
                viewMode === "chat" && "hidden"
              )}
            >
              <DashboardMcpPanel onInsertPrompt={handleInsertPrompt} className="h-full" />
            </div>
          </main>
        </div>
      </div>
    </>
  );
}
