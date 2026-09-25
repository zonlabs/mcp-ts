"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  Home,
  LayoutGrid,
  SquarePen,
  Search,
  PanelLeftClose,
  PanelLeftOpen,
  X,
  User,
  ChevronsUpDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SimpleTooltip } from "@/components/ui/tooltip";
import { ProfileDropdown } from "@/components/common/ProfileDropdown";
import type { Project } from "@/lib/projects";
import type { SidebarChat } from "@/lib/sidebar-chats";
import { SidebarProjectsSection } from "./SidebarProjectsSection";
import { SidebarChatsSection } from "./SidebarChatsSection";

export interface AppSidebarProps {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  mobileDrawerOpen: boolean;
  onCloseMobileDrawer: () => void;
  onOpenSearch: () => void;
  currentNav: string;
  userSession: any;
  userDisplayName: string;
  // Projects
  projects: Project[];
  allChats: SidebarChat[];
  currentChatId: string | null;
  expandedProjectIds: Set<string>;
  onToggleProjectExpanded: (projectId: string, e?: React.MouseEvent) => void;
  onOpenCreateProject: () => void;
  onShareProject: (project: Project) => void;
  // Chats
  pinnedChats: SidebarChat[];
  todayChats: SidebarChat[];
  yesterdayChats: SidebarChat[];
  olderChats: SidebarChat[];
  isChatsLoading: boolean;
  hasMore: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
  onDeleteChat: (id: string) => void;
  onTogglePinChat: (id: string, pinned: boolean) => void;
  onRenameChat: (id: string, title: string) => void;
  onShareChat: (chat: SidebarChat) => void;
}

export function AppSidebar({
  sidebarOpen,
  onToggleSidebar,
  mobileDrawerOpen,
  onCloseMobileDrawer,
  onOpenSearch,
  currentNav,
  userSession,
  userDisplayName,
  projects,
  allChats,
  currentChatId,
  expandedProjectIds,
  onToggleProjectExpanded,
  onOpenCreateProject,
  onShareProject,
  pinnedChats,
  todayChats,
  yesterdayChats,
  olderChats,
  isChatsLoading,
  hasMore,
  isFetchingNextPage,
  fetchNextPage,
  onDeleteChat,
  onTogglePinChat,
  onRenameChat,
  onShareChat,
}: AppSidebarProps) {
  const pathname = usePathname();

  const renderSidebarContent = ({ isMobile = false }: { isMobile?: boolean }) => {
    const isExpanded = isMobile || sidebarOpen;
    const handleItemClick = () => {
      if (isMobile) onCloseMobileDrawer();
    };

    return (
      <div className="flex flex-col min-h-0 flex-1 overflow-hidden">
        {/* Brand / Top Bar */}
        <div
          className={cn(
            "h-11 flex items-center shrink-0 border-b border-sidebar-border/40 overflow-hidden",
            isMobile
              ? "justify-between px-3"
              : isExpanded
                ? "justify-between px-3"
                : "justify-center px-0"
          )}
        >
          {isExpanded && (
            <Link
              href="/mcp?tab=home"
              onClick={handleItemClick}
              className="flex items-center gap-1.5 select-none hover:opacity-85 transition-opacity min-w-0 overflow-hidden"
            >
              <span className="text-[15px] font-bold tracking-tight text-foreground whitespace-nowrap">
                Link<span className="font-semibold text-muted-foreground">OS</span>
              </span>
            </Link>
          )}

          {isExpanded ? (
            <div className="flex items-center gap-1 shrink-0">
              <SimpleTooltip content="Search (⌘K)" side="bottom">
                <button
                  type="button"
                  onClick={onOpenSearch}
                  className="p-1 rounded-sm text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors cursor-pointer shrink-0"
                  aria-label="Search"
                >
                  <Search className="size-4" />
                </button>
              </SimpleTooltip>

              {isMobile ? (
                <SimpleTooltip content="Close menu" side="bottom">
                  <button
                    type="button"
                    onClick={onCloseMobileDrawer}
                    className="p-1 rounded-sm text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors cursor-pointer shrink-0"
                    aria-label="Close navigation menu"
                  >
                    <X className="size-4" />
                  </button>
                </SimpleTooltip>
              ) : (
                <SimpleTooltip content="Toggle sidebar" side="bottom">
                  <button
                    type="button"
                    onClick={onToggleSidebar}
                    className="p-1 rounded-sm text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors cursor-pointer shrink-0 flex items-center justify-center"
                    aria-label="Toggle sidebar"
                  >
                    <PanelLeftClose className="size-4" />
                  </button>
                </SimpleTooltip>
              )}
            </div>
          ) : (
            <SimpleTooltip content="Toggle sidebar" side="right">
              <button
                type="button"
                onClick={onToggleSidebar}
                className="size-8 rounded-sm text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors cursor-pointer shrink-0 flex items-center justify-center"
                aria-label="Toggle sidebar"
              >
                <PanelLeftOpen className="size-4" />
              </button>
            </SimpleTooltip>
          )}
        </div>

        {/* Nav Links */}
        <div
          className={cn(
            "flex-1 overflow-y-auto space-y-0.5 scrollbar-minimal overflow-x-hidden",
            isExpanded ? "px-2 py-1.5" : "px-1 py-1.5"
          )}
        >
          {/* Main Links */}
          <SimpleTooltip content={!isExpanded ? "Home" : null} side="right">
            <Link
              href="/mcp?tab=home"
              onClick={handleItemClick}
              className={cn(
                "w-full flex items-center gap-2.5 rounded-sm text-[13px] font-medium transition-colors text-left overflow-hidden",
                isExpanded ? "px-2.5 py-1.5" : "justify-center h-8 w-full px-0",
                currentNav === "home"
                  ? "bg-sidebar-accent text-sidebar-foreground font-semibold shadow-2xs"
                  : "text-sidebar-foreground/75 hover:text-sidebar-foreground hover:bg-sidebar-accent/60"
              )}
            >
              <Home className="size-4 shrink-0" />
              {isExpanded && <span className="truncate whitespace-nowrap">Home</span>}
            </Link>
          </SimpleTooltip>

          <SimpleTooltip content={!isExpanded ? "Apps" : null} side="right">
            <Link
              href="/mcp?tab=apps"
              onClick={handleItemClick}
              className={cn(
                "w-full flex items-center gap-2.5 rounded-sm text-[13px] font-medium transition-colors text-left overflow-hidden",
                isExpanded ? "px-2.5 py-1.5" : "justify-center h-8 w-full px-0",
                currentNav === "apps"
                  ? "bg-sidebar-accent text-sidebar-foreground font-semibold shadow-2xs"
                  : "text-sidebar-foreground/75 hover:text-sidebar-foreground hover:bg-sidebar-accent/60"
              )}
            >
              <LayoutGrid className="size-4 shrink-0" />
              {isExpanded && <span className="truncate whitespace-nowrap">Apps</span>}
            </Link>
          </SimpleTooltip>

          {/* New Chat */}
          <SimpleTooltip content={!isExpanded ? "New Chat" : null} side="right">
            <Link
              href="/chat"
              onClick={handleItemClick}
              className={cn(
                "w-full flex items-center gap-2.5 rounded-sm text-[13px] font-medium transition-colors text-left overflow-hidden",
                isExpanded ? "px-2.5 py-1.5" : "justify-center h-8 w-full px-0",
                currentNav === "chat" && (pathname === "/chat" || pathname === "/chat/")
                  ? "bg-sidebar-accent text-sidebar-foreground font-semibold shadow-2xs"
                  : "text-sidebar-foreground/75 hover:text-sidebar-foreground hover:bg-sidebar-accent/60"
              )}
            >
              <SquarePen className="size-4 shrink-0" />
              {isExpanded && <span className="truncate whitespace-nowrap">New Chat</span>}
            </Link>
          </SimpleTooltip>

          {/* Projects Section */}
          <SidebarProjectsSection
            isExpanded={isExpanded}
            isMobile={isMobile}
            projects={projects}
            allChats={allChats}
            currentChatId={currentChatId}
            currentNav={currentNav}
            expandedProjectIds={expandedProjectIds}
            onToggleProjectExpanded={onToggleProjectExpanded}
            onOpenCreateProject={onOpenCreateProject}
            onShareProject={onShareProject}
            onDeleteChat={onDeleteChat}
            onTogglePinChat={onTogglePinChat}
            onRenameChat={onRenameChat}
            onShareChat={onShareChat}
            onItemClick={handleItemClick}
          />

          {/* Chats / History Section */}
          <SidebarChatsSection
            isExpanded={isExpanded}
            pinned={pinnedChats}
            todayChats={todayChats}
            yesterdayChats={yesterdayChats}
            olderChats={olderChats}
            currentChatId={currentChatId}
            isChatsLoading={isChatsLoading}
            hasMore={hasMore}
            isFetchingNextPage={isFetchingNextPage}
            fetchNextPage={fetchNextPage}
            onDeleteChat={onDeleteChat}
            onTogglePinChat={onTogglePinChat}
            onRenameChat={onRenameChat}
            onShareChat={onShareChat}
            onItemClick={handleItemClick}
          />
        </div>

        {/* Profile Footer */}
        <div
          className={cn(
            "pt-2 pb-3 bg-sidebar shrink-0",
            isExpanded ? "px-2" : "px-1"
          )}
        >
          {userSession?.user && (
            <ProfileDropdown
              user={userSession.user}
              trigger={
                <div
                  className={cn(
                    "w-full flex items-center gap-2 rounded-sm py-0.5 cursor-pointer transition-colors hover:bg-sidebar-accent",
                    isExpanded ? "px-1" : "justify-center h-8 px-0"
                  )}
                  aria-label="Open profile menu"
                  aria-haspopup="menu"
                >
                  {userSession.user?.user_metadata?.avatar_url ? (
                    <Image
                      src={userSession.user.user_metadata.avatar_url}
                      alt=""
                      width={26}
                      height={26}
                      className="rounded-sm object-cover shrink-0"
                      loading="eager"
                      priority
                      aria-hidden
                    />
                  ) : (
                    <div className="flex size-6.5 items-center justify-center rounded-sm bg-primary/10 text-primary shrink-0">
                      <User className="size-[18px]" strokeWidth={2} aria-hidden />
                    </div>
                  )}
                  {isExpanded && (
                    <div className="min-w-0 flex-1 overflow-hidden">
                      <p className="text-xs font-semibold text-foreground truncate whitespace-nowrap">
                        {userDisplayName}
                      </p>
                      {userSession.user?.email && (
                        <p className="text-[10px] text-muted-foreground truncate whitespace-nowrap font-mono">
                          {userSession.user.email}
                        </p>
                      )}
                    </div>
                  )}
                  {isExpanded && (
                    <ChevronsUpDown
                      className="size-3.5 shrink-0 text-muted-foreground"
                      strokeWidth={1.8}
                      aria-hidden
                    />
                  )}
                </div>
              }
            />
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      {/* Desktop Sidebar (hidden on <lg) */}
      <aside
        className={cn(
          "hidden lg:flex h-full bg-sidebar text-sidebar-foreground flex-col transition-[width,margin] duration-200 ease-in-out shrink-0 z-30 overflow-hidden",
          sidebarOpen ? "w-64 ml-0 mr-0" : "w-12 ml-1 sm:ml-1.5 mr-1 sm:mr-1.5"
        )}
      >
        {renderSidebarContent({ isMobile: false })}
      </aside>

      {/* Mobile Drawer Backdrop */}
      {mobileDrawerOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-xs z-40 lg:hidden transition-opacity animate-in fade-in duration-200"
          onClick={onCloseMobileDrawer}
          aria-hidden="true"
        />
      )}

      {/* Mobile Drawer Sidebar (lg:hidden) */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] h-full bg-sidebar text-sidebar-foreground flex flex-col shadow-2xl transition-transform duration-200 ease-out lg:hidden",
          mobileDrawerOpen ? "translate-x-0" : "-translate-x-full pointer-events-none"
        )}
      >
        {renderSidebarContent({ isMobile: true })}
      </aside>
    </>
  );
}
