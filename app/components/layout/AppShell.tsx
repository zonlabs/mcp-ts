"use client";

import React, { useState, useMemo, useEffect, useRef, useCallback, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import {
  Home,
  LayoutGrid,
  Folder,
  SquarePen,
  Search,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  Clock,
  MoreHorizontal,
  Pin,
  PinOff,
  Pencil,
  ExternalLink,
  Share2,
  X,
  User,
  Link as LinkIcon,
  Github,
  Download,
  Settings,
  Trash2,
  Upload,
  FolderPen,
  Users,
  Globe,
} from "lucide-react";
import Image from "next/image";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-hot-toast";
import { ThemeToggle } from "@/components/common/ThemeToggle";
import { ProfileDropdown } from "@/components/common/ProfileDropdown";
import { useAuth } from "@/components/providers/AuthProvider";
import type { Project } from "@/lib/projects";
import { useSidebarChats, useUpdateChat, useDeleteChat } from "@/lib/hooks/use-sidebar-chats";
import { useSidebarProjects, useUpdateProject, useDeleteProject, useProject } from "@/lib/hooks/use-sidebar-projects";
import { SearchDialog } from "@/components/layout/SearchDialog";
import { ShareDialog } from "@/components/chat/ShareDialog";
import { CreateProjectDialog } from "@/components/projects/CreateProjectDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { SimpleTooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import type { SidebarChat, PaginatedSidebarChats } from "@/lib/sidebar-chats";
import { SidebarChatSkeleton } from "@/components/layout/SidebarChatSkeleton";

/* ─── helpers ──────────────────────────────────────────────────────────────── */

function formatChatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/* ─── Project context-menu ─────────────────────────────────────────────────── */

function ProjectContextMenu({
  project,
  onProjectUpdated,
  onProjectDeleted,
  onShareProject,
}: {
  project: Project;
  onProjectUpdated?: () => void;
  onProjectDeleted?: (projectId: string) => void;
  onShareProject?: (project: Project) => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const updateProject = useUpdateProject();
  const deleteProject = useDeleteProject();

  const [open, setOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [renameName, setRenameName] = useState(project.name);

  const handleShare = async () => {
    try {
      const url = `${window.location.origin}/projects/${project.id}`;
      await navigator.clipboard.writeText(url);
      toast.success("Project link copied to clipboard");
    } catch {
      toast.error("Failed to copy project link");
    }
  };

  const handleRenameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = renameName.trim();
    if (!trimmed || updateProject.isPending) return;
    try {
      await updateProject.mutateAsync({ id: project.id, name: trimmed });
      toast.success("Project renamed");
      setRenameOpen(false);
      onProjectUpdated?.();
    } catch {
      // Handled by mutation toast
    }
  };

  const handleTogglePin = async () => {
    const nextPinned = !project.is_pinned;
    try {
      await updateProject.mutateAsync({ id: project.id, is_pinned: nextPinned });
      toast.success(nextPinned ? "Project pinned" : "Project unpinned");
      onProjectUpdated?.();
    } catch {
      // Handled by mutation toast
    }
  };

  const handleDelete = async () => {
    if (deleteProject.isPending) return;
    try {
      await deleteProject.mutateAsync(project.id);
      setDeleteOpen(false);
      onProjectDeleted?.(project.id);
      if (pathname === `/projects/${project.id}` || pathname.startsWith(`/projects/${project.id}/`)) {
        router.push("/");
      }
    } catch {
      // Handled by mutation toast
    }
  };

  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            onClick={(e) => e.stopPropagation()}
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/80 transition-colors"
            aria-label="Project actions"
          >
            <MoreHorizontal className="size-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48 text-xs">
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              setOpen(false);
              if (onShareProject) {
                onShareProject(project);
              } else {
                handleShare();
              }
            }}
            className="gap-2.5 py-2 cursor-pointer"
          >
            <Share2 className="size-4 text-muted-foreground" />
            <span>Share project</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              setOpen(false);
              setRenameName(project.name);
              setRenameOpen(true);
            }}
            className="gap-2.5 py-2 cursor-pointer"
          >
            <Pencil className="size-4 text-muted-foreground" />
            <span>Rename project</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              setOpen(false);
              router.push(`/projects/${project.id}?tab=settings`);
            }}
            className="gap-2.5 py-2 cursor-pointer"
          >
            <Settings className="size-4 text-muted-foreground" />
            <span>Project settings</span>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link
              href={`/projects/${project.id}`}
              onClick={(e) => e.stopPropagation()}
              className="gap-2.5 py-2 cursor-pointer"
            >
              <Folder className="size-4 text-muted-foreground" />
              <span>Project home</span>
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              setOpen(false);
              handleTogglePin();
            }}
            className="gap-2.5 py-2 cursor-pointer"
          >
            {project.is_pinned ? (
              <><PinOff className="size-4 text-muted-foreground" /><span>Unpin project</span></>
            ) : (
              <><Pin className="size-4 text-muted-foreground" /><span>Pin project</span></>
            )}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              setOpen(false);
              setDeleteOpen(true);
            }}
            className="gap-2.5 py-2 cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10"
          >
            <Trash2 className="size-4" />
            <span>Delete project</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Rename Dialog — lives inside this component, no Radix focus race */}
      <Dialog open={renameOpen} onOpenChange={(o) => !updateProject.isPending && setRenameOpen(o)}>
        <DialogContent className="sm:max-w-md" onOpenAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">Rename Project</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Enter a new name for this project.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleRenameSubmit} className="space-y-4 pt-2">
            <input
              type="text"
              value={renameName}
              disabled={updateProject.isPending}
              onChange={(e) => setRenameName(e.target.value)}
              className="w-full h-9 px-3 text-xs bg-background border border-border rounded-sm text-foreground focus:outline-none focus:border-primary font-sans disabled:opacity-50"
              placeholder="Enter new project name"
              autoFocus
            />
            <div className="flex items-center justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" disabled={updateProject.isPending}
                onClick={() => setRenameOpen(false)} className="h-8 px-3 text-xs cursor-pointer">
                Cancel
              </Button>
              <Button type="submit" size="sm"
                disabled={!renameName.trim() || updateProject.isPending} className="h-8 px-3 text-xs cursor-pointer">
                {updateProject.isPending ? "Saving..." : "Save"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteOpen} onOpenChange={(o) => !deleteProject.isPending && setDeleteOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Project</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &ldquo;{project.name}&rdquo;? Associated chats will
              remain safe, but project files and instructions will be removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteProject.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDelete(); }}
              disabled={deleteProject.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 cursor-pointer"
            >
              {deleteProject.isPending ? "Deleting..." : "Delete project"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/* ─── Chat context-menu ─────────────────────────────────────────────────────── */

interface ChatMenuProps {
  chat: SidebarChat;
  onDelete: (id: string) => void;
  onTogglePin: (id: string, pinned: boolean) => void;
  onRename: (id: string, title: string) => void;
  onShare: (chat: SidebarChat) => void;
}

function ChatContextMenu({ chat, onDelete, onTogglePin, onRename, onShare }: ChatMenuProps) {
  const [open, setOpen] = useState(false);
  const { userSession } = useAuth();
  const isOwner = Boolean(
    userSession?.user?.id && (chat.user_id ? chat.user_id === userSession.user.id : true)
  );

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <SimpleTooltip content={open ? null : "More options"}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onPointerDown={(e) => {
              e.stopPropagation();
            }}
            className="opacity-0 group-hover:opacity-100 p-1 rounded-sm text-muted-foreground hover:text-foreground hover:bg-card/80 transition-all cursor-pointer"
            aria-label="More options"
          >
            <MoreHorizontal className="size-[18px]" />
          </button>
        </DropdownMenuTrigger>
      </SimpleTooltip>
      <DropdownMenuContent
        align="end"
        sideOffset={4}
        className="w-44 text-[12px] font-sans"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        {isOwner && (
          <DropdownMenuItem
            onSelect={() => {
              setOpen(false);
              onTogglePin(chat.id, !chat.is_pinned);
            }}
            className="gap-2 py-1.5 cursor-pointer"
          >
            {chat.is_pinned ? <PinOff className="size-[18px] text-muted-foreground" /> : <Pin className="size-[18px] text-muted-foreground" />}
            {chat.is_pinned ? "Unpin chat" : "Pin chat"}
          </DropdownMenuItem>
        )}
        {isOwner && (
          <DropdownMenuItem
            onSelect={() => {
              setOpen(false);
              onRename(chat.id, chat.title || "New Chat");
            }}
            className="gap-2 py-1.5 cursor-pointer"
          >
            <Pencil className="size-[18px] text-muted-foreground" />
            Rename
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          onSelect={() => {
            setOpen(false);
            window.open(`/chat/${chat.id}`, "_blank", "noopener,noreferrer");
          }}
          className="gap-2 py-1.5 cursor-pointer"
        >
          <ExternalLink className="size-[18px] text-muted-foreground" />
          Open in new tab
        </DropdownMenuItem>
        {isOwner ? (
          <DropdownMenuItem
            onSelect={() => {
              setOpen(false);
              onShare(chat);
            }}
            className="gap-2 py-1.5 cursor-pointer"
          >
            <Share2 className="size-[18px] text-muted-foreground" />
            Share
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem
            onSelect={() => {
              setOpen(false);
              const origin = typeof window !== "undefined" ? window.location.origin : "";
              const url = `${origin}/share/${chat.id}`;
              navigator.clipboard.writeText(url);
              toast.success("Link copied to clipboard");
            }}
            className="gap-2 py-1.5 cursor-pointer"
          >
            <LinkIcon className="size-[18px] text-muted-foreground" />
            Copy link
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          onSelect={() => {
            setOpen(false);
            window.location.href = `/api/chats/export?id=${chat.id}`;
          }}
          className="gap-2 py-1.5 cursor-pointer"
        >
          <Download className="size-[18px] text-muted-foreground" />
          Export JSON
        </DropdownMenuItem>
        {isOwner && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => {
                setOpen(false);
                onDelete(chat.id);
              }}
              className="gap-2 py-1.5 cursor-pointer text-destructive focus:text-destructive"
            >
              <X className="size-[18px] text-destructive" />
              Delete
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ─── Chat list item ────────────────────────────────────────────────────────── */

function ChatItem({
  chat,
  isActive,
  onDelete,
  onTogglePin,
  onRename,
  onShare,
}: {
  chat: SidebarChat;
  isActive: boolean;
  onDelete: (id: string) => void;
  onTogglePin: (id: string, pinned: boolean) => void;
  onRename: (id: string, title: string) => void;
  onShare: (chat: SidebarChat) => void;
}) {
  const href = chat.project_id
    ? `/projects/${chat.project_id}/chat/${chat.id}`
    : `/chat/${chat.id}`;

  return (
    <Link
      href={href}
      className={cn(
        "group flex items-start justify-between gap-1 px-2 py-1 rounded-sm transition-colors",
        isActive
          ? "bg-sidebar-accent text-sidebar-foreground font-medium"
          : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
      )}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          {chat.is_pinned && (
            <Pin className="size-3.5 shrink-0 text-foreground/75" strokeWidth={2.4} />
          )}
          {chat.visibility === "PUBLIC" && (
            <SimpleTooltip content="Publicly shared">
              <span className="shrink-0 flex items-center text-foreground/75 hover:text-foreground" aria-label="Publicly shared">
                <Share2 className="size-3.5 shrink-0 text-primary/70" />
              </span>
            </SimpleTooltip>
          )}
          <p className="text-[13px] font-medium leading-snug truncate">
            {chat.title || "New Chat"}
          </p>
        </div>
        <p className="text-[10px] font-mono text-muted-foreground/70 mt-0.5">
          {formatChatDate(chat.updated_at || chat.created_at)}
        </p>
      </div>
      <ChatContextMenu
        chat={chat}
        onDelete={onDelete}
        onTogglePin={onTogglePin}
        onRename={onRename}
        onShare={onShare}
      />
    </Link>
  );
}



interface AppShellProps {
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
    removeChat,
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
  const [projectsOpen, setProjectsOpen] = useState(true);
  const [pinnedOpen, setPinnedOpen] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(true);

  const [editingChat, setEditingChat] = useState<{ id: string; title: string } | null>(null);
  const [createProjectOpen, setCreateProjectOpen] = useState(false);

  // Sentinel ref for infinite scroll loading of older chats
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sentinel = loadMoreSentinelRef.current;
    if (!sentinel || !hasMore || isFetchingNextPage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          fetchNextPage();
        }
      },
      { threshold: 0.1, rootMargin: "100px" }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, isFetchingNextPage, fetchNextPage]);

  // Auto-close mobile drawer when route changes
  useEffect(() => {
    setMobileDrawerOpen(false);
  }, [pathname, searchParams]);

  // Share Dialog state
  const [shareChat, setShareChat] = useState<SidebarChat | null>(null);
  const [shareProject, setShareProject] = useState<Project | null>(null);
  const [shareVisibility, setShareVisibility] = useState<"PRIVATE" | "PUBLIC">("PRIVATE");
  const [shareCopyMessage, setShareCopyMessage] = useState<string | null>(null);
  const [isSavingShare, setIsSavingShare] = useState(false);

  const handleOpenShare = (chat: SidebarChat) => {
    setShareChat(chat);
    setShareVisibility((chat.visibility || "PRIVATE") as "PRIVATE" | "PUBLIC");
    setShareCopyMessage(null);
  };

  const handleSaveShare = async (nextVisibility?: "PRIVATE" | "PUBLIC") => {
    if (!shareChat) return;
    setIsSavingShare(true);
    const targetVisibility = nextVisibility ?? shareVisibility;
    const supabase = createClient();
    const { error } = await supabase
      .from("chats")
      .update({ visibility: targetVisibility, updated_at: new Date().toISOString() })
      .eq("id", shareChat.id);

    if (error) {
      console.error("[AppShell] failed to update share settings:", error);
      toast.error("Failed to update share settings");
      setIsSavingShare(false);
      return;
    }

    setShareVisibility(targetVisibility);
    setShareChat((prev) => prev ? { ...prev, visibility: targetVisibility } : null);
    upsertChat({ id: shareChat.id, visibility: targetVisibility });
    setIsSavingShare(false);
    toast.success("Share settings updated");
  };

  const handleCopyShareLink = async () => {
    if (!shareChat) return;
    if (shareVisibility !== "PUBLIC") {
      setShareCopyMessage("Make chat public to enable sharing.");
      setTimeout(() => setShareCopyMessage(null), 2000);
      return;
    }
    const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
    const shareUrl = `${baseUrl}/share/${shareChat.id}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareCopyMessage("Link copied!");
      toast.success("Share link copied to clipboard");
      setTimeout(() => setShareCopyMessage(null), 2000);
    } catch {
      setShareCopyMessage("Failed to copy link");
      setTimeout(() => setShareCopyMessage(null), 2000);
    }
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

  // Chat mutations (centralized TanStack Query hooks with optimistic updates)
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

  // User projects for sidebar (centralized in-memory state via useSidebarProjects)
  const {
    projects,
    upsertProject,
    removeProject,
    refetch: refetchProjects,
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
        // ALL pinned chats appear under pinned label regardless of project or non-project
        pinned.push(chat);
      } else if (!chat.project_id) {
        // Non-project chats appear under Chats
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

  // Global ⌘K
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

  useEffect(() => {
    if (currentNav === "chat") setHistoryOpen(true);
  }, [currentNav]);

  const renderSidebarContent = ({ isMobile = false }: { isMobile?: boolean }) => {
    const isExpanded = isMobile || sidebarOpen;
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
              onClick={() => isMobile && setMobileDrawerOpen(false)}
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
                  onClick={() => setSearchOpen(true)}
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
                    onClick={() => setMobileDrawerOpen(false)}
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
                    onClick={() => setSidebarOpen(!sidebarOpen)}
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
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="size-8 rounded-sm text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors cursor-pointer shrink-0 flex items-center justify-center"
                aria-label="Toggle sidebar"
              >
                <PanelLeftOpen className="size-4" />
              </button>
            </SimpleTooltip>
          )}
        </div>

        {/* Nav */}
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
              onClick={() => isMobile && setMobileDrawerOpen(false)}
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
              onClick={() => isMobile && setMobileDrawerOpen(false)}
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
              onClick={() => {
                if (isMobile) setMobileDrawerOpen(false);
              }}
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

          {/* Pinned Section */}
          {pinned.length > 0 && isExpanded && (
            <div className="pt-2">
              <div className="w-full flex items-center justify-between px-2 py-1 group/pinned-header">
                <button
                  type="button"
                  onClick={() => setPinnedOpen((o) => !o)}
                  className="flex items-center gap-1.5 text-xs font-semibold text-sidebar-foreground/80 hover:text-sidebar-foreground transition-colors cursor-pointer"
                >
                  <span className="text-[13px]">Pinned</span>
                  <span className="transition-opacity opacity-0 group-hover/pinned-header:opacity-100">
                    {pinnedOpen ? (
                      <ChevronDown className="size-3.5 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="size-3.5 text-muted-foreground" />
                    )}
                  </span>
                </button>
              </div>

              {pinnedOpen && (
                <div className="mt-1 space-y-0.5 px-0.5">
                  {pinned.map((chat) => (
                    <div key={chat.id} onClick={() => isMobile && setMobileDrawerOpen(false)}>
                      <ChatItem
                        chat={chat}
                        isActive={currentChatId === chat.id}
                        onDelete={(id) => deleteMutation.mutate(id)}
                        onTogglePin={(id, p) => pinMutation.mutate({ id, pinned: p })}
                        onRename={(id, title) => setEditingChat({ id, title })}
                        onShare={handleOpenShare}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Projects Section */}
          {!isExpanded ? (
            <SimpleTooltip content="Projects" side="right">
              <Link
                href="/projects"
                onClick={() => isMobile && setMobileDrawerOpen(false)}
                className={cn(
                  "w-full flex items-center justify-center h-8 px-0 rounded-sm text-[13px] font-medium transition-colors text-left overflow-hidden",
                  currentNav === "projects"
                    ? "bg-sidebar-accent text-sidebar-foreground font-semibold shadow-2xs"
                    : "text-sidebar-foreground/75 hover:text-sidebar-foreground hover:bg-sidebar-accent/60"
                )}
              >
                <Folder className="size-4 shrink-0" />
              </Link>
            </SimpleTooltip>
          ) : (
            <div className="pt-2">
              <div className="w-full flex items-center justify-between px-2 py-1 group/projects-header">
                <button
                  type="button"
                  onClick={() => setProjectsOpen((o) => !o)}
                  className="flex items-center gap-1.5 text-xs font-semibold text-sidebar-foreground/80 hover:text-sidebar-foreground transition-colors cursor-pointer"
                >
                  <span className="text-[13px]">Projects</span>
                  <span className="transition-opacity opacity-0 group-hover/projects-header:opacity-100">
                    {projectsOpen ? (
                      <ChevronDown className="size-3.5 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="size-3.5 text-muted-foreground" />
                    )}
                  </span>
                </button>
                <div className="flex items-center gap-0.5 opacity-0 group-hover/projects-header:opacity-100 transition-opacity">
                  <SimpleTooltip content="Add project" side="top">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setCreateProjectOpen(true);
                      }}
                      className="p-1 rounded-sm text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors cursor-pointer flex items-center justify-center"
                      aria-label="Add project"
                    >
                      <FolderPen className="size-3.5" />
                    </button>
                  </SimpleTooltip>
                  <SimpleTooltip content="All projects" side="top">
                    <Link
                      href="/projects"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isMobile) setMobileDrawerOpen(false);
                      }}
                      className="p-1 rounded-sm text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors cursor-pointer flex items-center justify-center"
                      aria-label="All projects"
                    >
                      <Folder className="size-3.5" />
                    </Link>
                  </SimpleTooltip>
                </div>
              </div>

              {projectsOpen && (
                <div className="mt-1 space-y-0.5 px-0.5">
                  {projects.map((project) => {
                    const projectChats = allChats
                      .filter((c) => c.project_id === project.id)
                      .sort(
                        (a, b) =>
                          (Date.parse(b.updated_at || b.created_at || "") || 0) -
                          (Date.parse(a.updated_at || a.created_at || "") || 0)
                      );
                    const isProjectActive =
                      !currentChatId &&
                      (pathname === `/projects/${project.id}` || pathname.startsWith(`/projects/${project.id}/`));
                    const isProjectExpanded = expandedProjectIds.has(project.id);

                    return (
                      <div key={project.id} className="space-y-0.5">
                        <div
                          className={cn(
                            "group flex items-center justify-between gap-1.5 px-2 py-1.5 rounded-lg text-[13px] transition-colors cursor-pointer",
                            isProjectActive
                              ? "bg-sidebar-accent text-sidebar-foreground font-medium shadow-2xs"
                              : "text-sidebar-foreground/80 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
                          )}
                          onClick={() => toggleProjectExpanded(project.id)}
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <Folder className={cn("size-4 shrink-0", isProjectActive ? "text-foreground" : "text-muted-foreground")} />
                            <Link
                              href={`/projects/${project.id}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (isMobile) setMobileDrawerOpen(false);
                              }}
                              className="truncate font-medium text-[13px] hover:underline"
                            >
                              {project.name}
                            </Link>
                            {project.is_pinned && (
                              <Pin className="size-3 shrink-0 text-muted-foreground/80 -rotate-45" />
                            )}
                            {/* Sharing indicator icons */}
                            {project.role && project.role !== 'owner' ? (
                              <SimpleTooltip content={`Shared with you (${project.role})`}>
                                <span className="shrink-0 flex items-center text-foreground/75 hover:text-foreground" aria-label={`Shared with you (${project.role})`}>
                                  <Users className="size-3.5 shrink-0 text-primary/70" />
                                </span>
                              </SimpleTooltip>
                            ) : (
                              <>
                                {project.shares_count && project.shares_count > 0 ? (
                                  <SimpleTooltip content={`Shared with ${project.shares_count} collaborator${project.shares_count > 1 ? 's' : ''}`}>
                                    <span className="shrink-0 flex items-center text-foreground/75 hover:text-foreground" aria-label={`Shared with ${project.shares_count} collaborators`}>
                                      <Users className="size-3.5 shrink-0 text-primary/70" />
                                    </span>
                                  </SimpleTooltip>
                                ) : null}
                                {project.visibility === "PUBLIC" ? (
                                  <SimpleTooltip content="Publicly shared project">
                                    <span className="shrink-0 flex items-center text-foreground/75 hover:text-foreground" aria-label="Publicly shared project">
                                      <Share2 className="size-3.5 shrink-0 text-primary/70" />
                                    </span>
                                  </SimpleTooltip>
                                ) : project.is_shared && (!project.shares_count || project.shares_count === 0) ? (
                                  <SimpleTooltip content="Shared project">
                                    <span className="shrink-0 flex items-center text-foreground/75 hover:text-foreground" aria-label="Shared project">
                                      <Share2 className="size-3.5 shrink-0 text-primary/70" />
                                    </span>
                                  </SimpleTooltip>
                                ) : null}
                              </>
                            )}
                          </div>

                          <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                            <SimpleTooltip content="New chat in project">
                              <Link
                                href={`/projects/${project.id}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (isMobile) setMobileDrawerOpen(false);
                                }}
                                className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/80 transition-colors"
                              >
                                <SquarePen className="size-3.5" />
                              </Link>
                            </SimpleTooltip>

                            <ProjectContextMenu
                              project={project}
                              onShareProject={setShareProject}
                            />
                          </div>
                        </div>

                        {/* Indented chat threads or 'No project chats' */}
                        {isProjectExpanded && (
                          <div className="space-y-0.5">
                            {projectChats.length > 0 ? (
                              <div className="pl-6 space-y-0.5">
                                {projectChats.map((chat) => (
                                  <div key={chat.id} onClick={() => isMobile && setMobileDrawerOpen(false)}>
                                    <ChatItem
                                      chat={chat}
                                      isActive={currentChatId === chat.id}
                                      onDelete={(id) => deleteMutation.mutate(id)}
                                      onTogglePin={(id, p) => pinMutation.mutate({ id, pinned: p })}
                                      onRename={(id, title) => setEditingChat({ id, title })}
                                      onShare={handleOpenShare}
                                    />
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="pl-6 py-1 text-xs text-muted-foreground/60 select-none">
                                No project chats
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Chats Section Header */}
          {isExpanded && (
            <div className="pt-3">
              <div className="w-full flex items-center justify-between px-2 py-1 group/chats-header">
                <button
                  type="button"
                  onClick={() => setHistoryOpen((o) => !o)}
                  className="flex items-center gap-1.5 text-xs font-semibold text-sidebar-foreground/80 hover:text-sidebar-foreground transition-colors cursor-pointer"
                >
                  <span className="text-[13px]">Chats</span>
                  <span className="transition-opacity opacity-0 group-hover/chats-header:opacity-100">
                    {historyOpen ? (
                      <ChevronDown className="size-3.5 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="size-3.5 text-muted-foreground" />
                    )}
                  </span>
                </button>
              </div>

              {historyOpen && (
                <div className="mt-1 space-y-1">
                  {isChatsLoading && allChats.length === 0 ? (
                    <SidebarChatSkeleton count={8} className="px-1" />
                  ) : (
                    <>
                      {/* Empty state */}
                      {pinned.length === 0 &&
                        todayChats.length === 0 &&
                        yesterdayChats.length === 0 &&
                        olderChats.length === 0 && (
                          <div className="px-3 py-2 text-xs text-muted-foreground/60 select-none">
                            No chats yet
                          </div>
                        )}

                      {/* Today */}
                      {todayChats.length > 0 && (
                        <div>
                          <p className="px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-sidebar-foreground/60 font-medium">
                            Today
                          </p>
                          <div className="space-y-0.5 px-1">
                            {todayChats.map((chat) => (
                              <div key={chat.id} onClick={() => isMobile && setMobileDrawerOpen(false)}>
                                <ChatItem
                                  chat={chat}
                                  isActive={currentChatId === chat.id}
                                  onDelete={(id) => deleteMutation.mutate(id)}
                                  onTogglePin={(id, p) => pinMutation.mutate({ id, pinned: p })}
                                  onRename={(id, title) => setEditingChat({ id, title })}
                                  onShare={handleOpenShare}
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Yesterday */}
                      {yesterdayChats.length > 0 && (
                        <div>
                          <p className="px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-sidebar-foreground/60 font-medium">
                            Yesterday
                          </p>
                          <div className="space-y-0.5 px-1">
                            {yesterdayChats.map((chat) => (
                              <div key={chat.id} onClick={() => isMobile && setMobileDrawerOpen(false)}>
                                <ChatItem
                                  chat={chat}
                                  isActive={currentChatId === chat.id}
                                  onDelete={(id) => deleteMutation.mutate(id)}
                                  onTogglePin={(id, p) => pinMutation.mutate({ id, pinned: p })}
                                  onRename={(id, title) => setEditingChat({ id, title })}
                                  onShare={handleOpenShare}
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Older */}
                      {olderChats.length > 0 && (
                        <div>
                          <p className="px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-sidebar-foreground/60 font-medium">
                            Older
                          </p>
                          <div className="space-y-0.5 px-1">
                            {olderChats.map((chat) => (
                              <div key={chat.id} onClick={() => isMobile && setMobileDrawerOpen(false)}>
                                <ChatItem
                                  chat={chat}
                                  isActive={currentChatId === chat.id}
                                  onDelete={(id) => deleteMutation.mutate(id)}
                                  onTogglePin={(id, p) => pinMutation.mutate({ id, pinned: p })}
                                  onRename={(id, title) => setEditingChat({ id, title })}
                                  onShare={handleOpenShare}
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Infinite scroll sentinel & skeleton */}
                      {hasMore && (
                        <div ref={loadMoreSentinelRef} className="py-1 px-1">
                          {isFetchingNextPage ? (
                            <SidebarChatSkeleton count={4} />
                          ) : (
                            <button
                              type="button"
                              onClick={() => fetchNextPage()}
                              className="w-full text-center py-1 text-[11px] text-muted-foreground/60 hover:text-foreground font-mono transition-colors cursor-pointer"
                            >
                              Load more
                            </button>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Profile */}
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
                      <p className="text-xs font-semibold text-foreground truncate whitespace-nowrap">{userDisplayName}</p>
                      {userSession.user?.email && (
                        <p className="text-[10px] text-muted-foreground truncate whitespace-nowrap font-mono">
                          {userSession.user.email}
                        </p>
                      )}
                    </div>
                  )}
                  {isExpanded && (
                    <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.8} aria-hidden />
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
    <div className="flex h-screen w-full bg-sidebar text-foreground overflow-hidden font-sans select-none antialiased py-1.5 sm:py-2 pr-1.5 sm:pr-2 pl-0 gap-0">
      <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} chats={allChats} />

      {/* ── Desktop Sidebar (hidden on <lg) ── */}
      <aside
        className={cn(
          "hidden lg:flex h-full bg-sidebar text-sidebar-foreground flex-col transition-[width,margin] duration-200 ease-in-out shrink-0 z-30 overflow-hidden",
          sidebarOpen ? "w-64 ml-0 mr-0" : "w-12 ml-1 sm:ml-1.5 mr-1 sm:mr-1.5"
        )}
      >
        {renderSidebarContent({ isMobile: false })}
      </aside>

      {/* ── Mobile Drawer Backdrop ── */}
      {mobileDrawerOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-xs z-40 lg:hidden transition-opacity animate-in fade-in duration-200"
          onClick={() => setMobileDrawerOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ── Mobile Drawer Sidebar (lg:hidden) ── */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] h-full bg-sidebar text-sidebar-foreground flex flex-col shadow-2xl transition-transform duration-200 ease-out lg:hidden",
          mobileDrawerOpen ? "translate-x-0" : "-translate-x-full pointer-events-none"
        )}
      >
        {renderSidebarContent({ isMobile: true })}
      </aside>

      {/* ── Main Content Area ── */}
      <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden bg-background border border-border rounded-lg relative shadow-xs">
        <header className="h-11 border-b border-border bg-background px-3 sm:px-4 flex items-center justify-between shrink-0 z-20 rounded-t-lg">
          <div className="flex items-center gap-2.5 min-w-0">
            {/* Mobile Menu Hamburger Toggle */}
            <SimpleTooltip content="Open navigation menu" side="bottom">
              <button
                type="button"
                onClick={() => setMobileDrawerOpen(true)}
                className="lg:hidden p-1.5 -ml-1 rounded-sm text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer shrink-0"
                aria-label="Open navigation menu"
              >
                <PanelLeftOpen className="size-[18px]" />
              </button>
            </SimpleTooltip>

            {currentProjectId ? (
              <div className="flex items-center gap-1.5 text-xs">
                <Folder className="size-3.5 text-muted-foreground shrink-0" />
                {isProjectChat ? (
                  <>
                    <Link
                      href={`/projects/${currentProjectId}`}
                      className="font-medium text-muted-foreground hover:text-foreground hover:underline transition-colors truncate max-w-[150px] sm:max-w-[220px]"
                    >
                      {currentProject?.name || "Project"}
                    </Link>
                    <span className="text-muted-foreground/60">/</span>
                    <span className="font-semibold text-foreground">Chat</span>
                  </>
                ) : (
                  <span className="font-semibold text-foreground truncate max-w-[200px] sm:max-w-[300px]">
                    {currentProject?.name || "Project"}
                  </span>
                )}
              </div>
            ) : (
              computedBreadcrumb && (
                <span className="text-xs font-mono text-muted-foreground truncate">{computedBreadcrumb}</span>
              )
            )}
          </div>

          {headerActions && (
            <div className="flex items-center justify-center min-w-0 px-2">
              {headerActions}
            </div>
          )}

          <div className="flex items-center gap-1.5 shrink-0 ml-auto">
            {currentChatId && !pathname.startsWith("/share") && (
              <SimpleTooltip content="Share chat" side="bottom">
                <button
                  type="button"
                  onClick={() => {
                    const found = allChats.find((c) => c.id === currentChatId);
                    handleOpenShare(
                      found || ({ id: currentChatId, title: "Chat", visibility: "PRIVATE" } as any)
                    );
                  }}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-md transition-colors cursor-pointer border border-border/60"
                  aria-label="Share chat"
                >
                  <Share2 className="size-3.5" />
                  <span className="hidden sm:inline">Share</span>
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
            setShareCopyMessage(null);
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

      {/* Rename Dialog */}
      <Dialog
        open={Boolean(editingChat)}
        onOpenChange={(open) => {
          if (!open) setEditingChat(null);
        }}
      >
        <DialogContent className="w-[calc(100vw-2rem)] max-w-sm border-border bg-card p-5 text-foreground shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">Rename Chat</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Enter a new title for this chat.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (editingChat && editingChat.title.trim() && !renameMutation.isPending) {
                renameMutation.mutate({ id: editingChat.id, title: editingChat.title.trim() });
              }
            }}
            className="space-y-4 pt-2"
          >
            <input
              type="text"
              value={editingChat?.title || ""}
              disabled={renameMutation.isPending}
              onChange={(e) =>
                setEditingChat((prev) => (prev ? { ...prev, title: e.target.value } : null))
              }
              className="w-full h-9 px-3 text-xs bg-background border border-border rounded-sm text-foreground focus:outline-none focus:border-primary font-sans disabled:opacity-50"
              placeholder="Enter new chat title"
              autoFocus
            />
            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={renameMutation.isPending}
                onClick={() => setEditingChat(null)}
                className="h-8 px-3 text-xs cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={!editingChat?.title?.trim() || renameMutation.isPending}
                className="h-8 px-3 text-xs cursor-pointer"
              >
                {renameMutation.isPending ? "Saving..." : "Save"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

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
