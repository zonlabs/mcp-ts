"use client";

import React, { useState, useMemo, useEffect, type ReactNode } from "react";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { useAuth } from "@/components/providers/AuthProvider";
import type { Project } from "@/lib/projects";
import { useSidebarChats, useUpdateChat, useDeleteChat } from "@/lib/hooks/use-chats";
import { useSidebarProjects, useProject } from "@/lib/hooks/use-projects";
import { SearchDialog } from "@/components/layout/SearchDialog";
import { ShareDialog } from "@/components/chat/ShareDialog";
import { CreateProjectDialog } from "@/components/projects/CreateProjectDialog";
import { createClient } from "@/lib/supabase/client";
import type { SidebarChat, PaginatedSidebarChats } from "@/lib/sidebar-chats";
import { AppSidebar } from "./sidebar/AppSidebar";
import { AppHeader } from "./AppHeader";
import { RenameChatDialog } from "./sidebar/RenameChatDialog";

export interface AppShellProps {
  children: ReactNode;
  activeNav?: "home" | "apps" | "projects" | "chat" | "settings";
  titleBreadcrumb?: string;
  headerActions?: ReactNode;
  initialChats?: SidebarChat[] | PaginatedSidebarChats;
  currentChatId?: string;
}

export function AppShell({
  children,
  activeNav,
  titleBreadcrumb,
  headerActions,
  initialChats = [],
  currentChatId: explicitChatId,
}: AppShellProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { userSession } = useAuth();

  const {
    chats: allChats,
    upsertChat,
    hasMore,
    isFetchingNextPage,
    fetchNextPage,
    isLoading: isChatsLoading,
  } = useSidebarChats(initialChats, {
    enabled: Boolean(userSession?.user),
  });

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [editingChat, setEditingChat] = useState<{ id: string; title: string } | null>(null);
  const [createProjectOpen, setCreateProjectOpen] = useState(false);

  // Auto-close mobile drawer when route changes
  useEffect(() => {
    setMobileDrawerOpen(false);
  }, [pathname, searchParams]);

  // Share Dialog state
  const [shareChat, setShareChat] = useState<SidebarChat | null>(null);
  const [shareProject, setShareProject] = useState<Project | null>(null);
  const [shareVisibility, setShareVisibility] = useState<"PRIVATE" | "PUBLIC">("PRIVATE");

  const handleOpenShare = (chat: SidebarChat) => {
    setShareChat(chat);
    setShareVisibility((chat.visibility || "PRIVATE") as "PRIVATE" | "PUBLIC");
  };

  const tabParam = searchParams.get("tab");

  const currentNav = useMemo(() => {
    if (activeNav) return activeNav;
    if (pathname.startsWith("/chat") || pathname.startsWith("/share")) return "chat";
    if (pathname.startsWith("/projects")) return "projects";
    if (pathname.startsWith("/settings")) return "settings";
    if (pathname.startsWith("/mcp")) {
      if (tabParam === "apps" || searchParams.get("view") === "app" || searchParams.has("server")) return "apps";
      return "home";
    }
    return "home";
  }, [activeNav, pathname, tabParam, searchParams]);

  const computedBreadcrumb = useMemo(() => {
    if (titleBreadcrumb) return titleBreadcrumb;
    if (pathname.startsWith("/share")) return "Shared Chat";
    if (pathname.startsWith("/chat")) return "Chat";
    if (pathname.startsWith("/projects")) return "Projects";
    if (pathname.startsWith("/settings/api-keys")) return "Settings > API Keys";
    if (pathname.startsWith("/settings/access")) return "Settings > Access";
    if (pathname.startsWith("/settings/preferences")) return "Settings > Preferences";
    if (pathname.startsWith("/settings/memories")) return "Settings > Memories";
    if (pathname.startsWith("/settings/data-controls")) return "Settings > Data Controls";
    if (pathname.startsWith("/settings/account")) return "Settings > Account";
    if (pathname.startsWith("/settings/usage")) return "Settings > Usage";
    if (pathname.startsWith("/faq")) return "FAQ";
    if (pathname.startsWith("/privacy")) return "Privacy Policy";
    if (pathname.startsWith("/mcp")) {
      if (searchParams.get("view") === "add") return "Apps > Add New App";
      if (searchParams.get("tab") === "apps" || searchParams.has("server")) return "Apps";
      return "Home";
    }
    return "Home";
  }, [titleBreadcrumb, pathname, searchParams]);

  const currentChatId = useMemo(() => {
    if (explicitChatId) return explicitChatId;
    const chatParam = searchParams.get("chat");
    if (chatParam) return chatParam;
    const match = pathname.match(/\/(?:chat|share)\/([^/]+)/);
    return match ? match[1] : null;
  }, [explicitChatId, pathname, searchParams]);

  const userDisplayName =
    userSession?.user?.user_metadata?.full_name ||
    userSession?.user?.email?.split("@")[0] ||
    "Developer";

  // Chat mutations
  const deleteChatHook = useDeleteChat();
  const updateChatHook = useUpdateChat();

  const deleteMutation = {
    isPending: deleteChatHook.isPending,
    mutate: (id: string) => {
      deleteChatHook.mutate(id, {
        onSuccess: () => {
          toast.success("Chat deleted");
          if (pathname === `/chat/${id}` || pathname.endsWith(`/chat/${id}`)) {
            router.push(pathname.startsWith("/projects/") ? pathname.split("/chat/")[0] : "/chat");
          }
        },
      });
    },
  };

  const pinMutation = {
    isPending: updateChatHook.isPending,
    mutate: ({ id, pinned }: { id: string; pinned: boolean }) => {
      updateChatHook.mutate(
        { id, is_pinned: pinned },
        {
          onSuccess: () => toast.success(pinned ? "Chat pinned" : "Chat unpinned"),
        }
      );
    },
  };

  const renameMutation = {
    isPending: updateChatHook.isPending,
    mutate: ({ id, title }: { id: string; title: string }) => {
      updateChatHook.mutate(
        { id, title },
        {
          onSuccess: () => {
            toast.success("Chat renamed");
            setEditingChat(null);
          },
        }
      );
    },
  };

  // User projects for sidebar
  const {
    projects,
    upsertProject,
  } = useSidebarProjects({
    enabled: Boolean(userSession?.user),
  });

  const currentProjectId = useMemo(() => {
    if (!pathname.startsWith("/projects/")) return null;
    const parts = pathname.split("/").filter(Boolean);
    return parts[1] || null;
  }, [pathname]);

  const { project: singleProject } = useProject(currentProjectId);

  const currentProject = useMemo(() => {
    if (!currentProjectId) return null;
    return projects.find((p) => p.id === currentProjectId) || singleProject || null;
  }, [currentProjectId, projects, singleProject]);

  const isProjectChat = useMemo(() => {
    return Boolean(currentProjectId && pathname.includes("/chat/"));
  }, [currentProjectId, pathname]);

  const [expandedProjectIds, setExpandedProjectIds] = useState<Set<string>>(new Set());

  // Auto-expand active project
  useEffect(() => {
    if (pathname.startsWith("/projects/")) {
      const pid = pathname.split("/")[2];
      if (pid) {
        setExpandedProjectIds((prev) => new Set(prev).add(pid));
      }
    }
  }, [pathname]);

  useEffect(() => {
    if (currentChatId && allChats.length > 0) {
      const currentChat = allChats.find((c) => c.id === currentChatId);
      if (currentChat?.project_id) {
        setExpandedProjectIds((prev) => new Set(prev).add(currentChat.project_id!));
      }
    }
  }, [currentChatId, allChats]);

  const toggleProjectExpanded = (projectId: string, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setExpandedProjectIds((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
      }
      return next;
    });
  };

  // Filter and group chats
  const { pinned, todayChats, yesterdayChats, olderChats } = useMemo(() => {
    const sorted = [...allChats].sort((a, b) => {
      const timeA = Date.parse(a.updated_at || a.created_at || "") || 0;
      const timeB = Date.parse(b.updated_at || b.created_at || "") || 0;
      return timeB - timeA;
    });

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

    const pinned: SidebarChat[] = [];
    const todayChats: SidebarChat[] = [];
    const yesterdayChats: SidebarChat[] = [];
    const olderChats: SidebarChat[] = [];

    for (const chat of sorted) {
      if (chat.is_pinned) {
        pinned.push(chat);
      } else if (!chat.project_id) {
        const timestamp = Date.parse(chat.updated_at || chat.created_at || "") || 0;
        if (!timestamp) {
          olderChats.push(chat);
          continue;
        }
        const chatDate = new Date(timestamp);
        const startOfChatDay = new Date(chatDate.getFullYear(), chatDate.getMonth(), chatDate.getDate()).getTime();
        const daysAgo = Math.floor((startOfToday - startOfChatDay) / 86_400_000);

        if (daysAgo <= 0) {
          todayChats.push(chat);
        } else if (daysAgo === 1) {
          yesterdayChats.push(chat);
        } else {
          olderChats.push(chat);
        }
      }
    }

    return { pinned, todayChats, yesterdayChats, olderChats };
  }, [allChats]);

  // Global ⌘K shortcut
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  return (
    <div className="flex h-screen w-full bg-sidebar text-foreground overflow-hidden font-sans select-none antialiased py-1.5 sm:py-2 px-1.5 sm:px-2 lg:pl-0 gap-0">
      <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} chats={allChats} />

      <AppSidebar
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
        mobileDrawerOpen={mobileDrawerOpen}
        onCloseMobileDrawer={() => setMobileDrawerOpen(false)}
        onOpenSearch={() => setSearchOpen(true)}
        currentNav={currentNav}
        userSession={userSession}
        userDisplayName={userDisplayName}
        projects={projects}
        allChats={allChats}
        currentChatId={currentChatId}
        expandedProjectIds={expandedProjectIds}
        onToggleProjectExpanded={toggleProjectExpanded}
        onOpenCreateProject={() => setCreateProjectOpen(true)}
        onShareProject={setShareProject}
        pinnedChats={pinned}
        todayChats={todayChats}
        yesterdayChats={yesterdayChats}
        olderChats={olderChats}
        isChatsLoading={isChatsLoading}
        hasMore={hasMore}
        isFetchingNextPage={isFetchingNextPage}
        fetchNextPage={fetchNextPage}
        onDeleteChat={(id) => deleteMutation.mutate(id)}
        onTogglePinChat={(id, p) => pinMutation.mutate({ id, pinned: p })}
        onRenameChat={(id, title) => setEditingChat({ id, title })}
        onShareChat={handleOpenShare}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden bg-background border border-border rounded-lg relative shadow-xs">
        <AppHeader
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
          onOpenMobileDrawer={() => setMobileDrawerOpen(true)}
          currentProjectId={currentProjectId}
          isProjectChat={isProjectChat}
          currentProjectName={currentProject?.name}
          computedBreadcrumb={computedBreadcrumb}
          headerActions={headerActions}
          canShareCurrentChat={Boolean(currentChatId && !pathname.startsWith("/share"))}
          onShareChat={() => {
            const found = allChats.find((c) => c.id === currentChatId);
            handleOpenShare(
              found || ({ id: currentChatId, title: "Chat", visibility: "PRIVATE" } as any)
            );
          }}
        />
        <div className="flex-1 flex min-h-0 min-w-0 overflow-hidden relative rounded-b-lg">
          {children}
        </div>
      </div>

      {/* Chat Share Dialog */}
      <ShareDialog
        open={Boolean(shareChat)}
        onOpenChange={(open) => {
          if (!open) {
            setShareChat(null);
          }
        }}
        type="chat"
        id={shareChat?.id}
        title="Share Chat"
        initialVisibility={shareVisibility}
        onVisibilityChange={(targetVisibility) => {
          setShareVisibility(targetVisibility);
          setShareChat((prev) => (prev ? { ...prev, visibility: targetVisibility } : null));
          if (shareChat?.id) {
            upsertChat({ id: shareChat.id, visibility: targetVisibility });
          }
        }}
      />

      {/* Project Share Dialog */}
      <ShareDialog
        open={Boolean(shareProject)}
        onOpenChange={(open) => {
          if (!open) {
            setShareProject(null);
          }
        }}
        type="project"
        id={shareProject?.id}
        title="Share Project"
        initialVisibility={(shareProject?.visibility as "PRIVATE" | "PUBLIC") || "PRIVATE"}
        onVisibilityChange={(targetVisibility) => {
          if (shareProject?.id) {
            upsertProject({
              id: shareProject.id,
              visibility: targetVisibility,
              is_shared: targetVisibility === "PUBLIC" || (shareProject.shares_count || 0) > 0,
            });
          }
          setShareProject((prev) => (prev ? { ...prev, visibility: targetVisibility } : null));
        }}
        onSharesChange={(updatedShares) => {
          if (shareProject?.id) {
            upsertProject({
              id: shareProject.id,
              shares_count: updatedShares.length,
              is_shared: shareProject.visibility === "PUBLIC" || updatedShares.length > 0,
            });
          }
        }}
      />

      {/* Rename Chat Dialog */}
      <RenameChatDialog
        editingChat={editingChat}
        onClose={() => setEditingChat(null)}
        onRename={(id, title) => renameMutation.mutate({ id, title })}
        isPending={renameMutation.isPending}
      />

      {/* Create Project Dialog */}
      <CreateProjectDialog
        open={createProjectOpen}
        onOpenChange={setCreateProjectOpen}
        onProjectCreated={(newProj) => {
          router.push(`/projects/${newProj.id}`);
        }}
      />
    </div>
  );
}
