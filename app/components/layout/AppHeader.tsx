"use client";

import React, { type ReactNode } from "react";
import Link from "next/link";
import { PanelLeftOpen, Folder, Share2, Github } from "lucide-react";
import { SimpleTooltip } from "@/components/ui/tooltip";
import { ThemeToggle } from "@/components/common/ThemeToggle";

export interface AppHeaderProps {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  onOpenMobileDrawer: () => void;
  currentProjectId: string | null;
  isProjectChat: boolean;
  currentProjectName?: string;
  computedBreadcrumb: string;
  headerActions?: ReactNode;
  canShareCurrentChat: boolean;
  onShareChat: () => void;
}

export function AppHeader({
  sidebarOpen,
  onToggleSidebar,
  onOpenMobileDrawer,
  currentProjectId,
  isProjectChat,
  currentProjectName,
  computedBreadcrumb,
  headerActions,
  canShareCurrentChat,
  onShareChat,
}: AppHeaderProps) {
  return (
    <header className="h-10 flex items-center justify-between px-3 shrink-0 bg-background/95 backdrop-blur-xs select-none">
      <div className="flex items-center gap-2 min-w-0">
        {/* Mobile menu trigger */}
        <button
          type="button"
          onClick={onOpenMobileDrawer}
          className="md:hidden p-1.5 rounded-sm text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors cursor-pointer"
          aria-label="Open navigation menu"
        >
          <PanelLeftOpen className="size-4" />
        </button>       

        {currentProjectId ? (
          <div className="flex items-center gap-1.5 text-xs">
            <Folder className="size-3.5 text-muted-foreground shrink-0" />
            {isProjectChat ? (
              <>
                <Link
                  href={`/projects/${currentProjectId}`}
                  className="font-medium text-muted-foreground hover:text-foreground hover:underline transition-colors truncate max-w-[150px] sm:max-w-[220px]"
                >
                  {currentProjectName || "Project"}
                </Link>
                <span className="text-muted-foreground/60">/</span>
                <span className="font-semibold text-foreground">Chat</span>
              </>
            ) : (
              <span className="font-semibold text-foreground truncate max-w-[200px] sm:max-w-[300px]">
                {currentProjectName || "Project"}
              </span>
            )}
          </div>
        ) : (
          computedBreadcrumb && (
            <span className="text-xs font-mono text-muted-foreground truncate">
              {computedBreadcrumb}
            </span>
          )
        )}
      </div>

      {headerActions && (
        <div className="flex items-center justify-center min-w-0 px-2">
          {headerActions}
        </div>
      )}

      <div className="flex items-center gap-1 shrink-0 ml-auto">
        {canShareCurrentChat && (
          <SimpleTooltip content="Share chat" side="bottom">
            <button
              type="button"
              onClick={onShareChat}
              className="p-1.5 text-muted-foreground hover:text-foreground transition-colors rounded-sm hover:bg-muted/50 flex items-center justify-center cursor-pointer"
              aria-label="Share chat"
            >
              <Share2 className="size-4" />
            </button>
          </SimpleTooltip>
        )}
        <Link
          href="https://github.com/zonlabs/mcp-ts"
          target="_blank"
          rel="noopener noreferrer"
          className="p-1.5 text-muted-foreground hover:text-foreground transition-colors rounded-sm hover:bg-muted/50 flex items-center justify-center"
          aria-label="GitHub Repository"
        >
          <Github className="size-4" />
        </Link>
        <ThemeToggle />
      </div>
    </header>
  );
}
