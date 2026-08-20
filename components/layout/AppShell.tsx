"use client";

import React, { useState, useMemo, useEffect, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import {
  Home,
  LayoutGrid,
  SquarePen,
  Search,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronDown,
  ChevronRight,
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
} from "lucide-react";
import Image from "next/image";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ThemeToggle } from "@/components/common/ThemeToggle";
import { ProfileDropdown } from "@/components/common/ProfileDropdown";
import { useAuth } from "@/components/providers/AuthProvider";
import { SearchDialog } from "@/components/layout/SearchDialog";
import { ShareConversationDialog } from "@/components/chat/ShareConversationDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { toast } from "react-hot-toast";
import { createClient } from "@/lib/supabase/client";
import type { SidebarChat } from "@/lib/sidebar-chats";

/* ─── helpers ──────────────────────────────────────────────────────────────── */

function formatChatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
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
        <DropdownMenuItem asChild className="gap-2 py-1.5 cursor-pointer">
          <a
            href={`/chat/${chat.id}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
          >
            <ExternalLink className="size-[18px] text-muted-foreground" />
            Open in new tab
          </a>
        </DropdownMenuItem>
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
  return (
    <Link
      href={`/chat/${chat.id}`}
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
  activeNav?: "home" | "apps" | "chat" | "settings";
  titleBreadcrumb?: string;
  headerActions?: ReactNode;
  initialChats?: SidebarChat[];
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
  const queryClient = useQueryClient();

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(true);
  const [chatSearch, setChatSearch] = useState("");
  const [editingChat, setEditingChat] = useState<{ id: string; title: string } | null>(null);

  // Auto-close mobile drawer when route changes
  useEffect(() => {
    setMobileDrawerOpen(false);
  }, [pathname, searchParams]);

  // Share Dialog state
  const [shareChat, setShareChat] = useState<SidebarChat | null>(null);
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
    queryClient.setQueryData<{ chats: SidebarChat[] }>(["sidebar-chats"], (old) => ({
      chats: (old?.chats ?? []).map((c) => c.id === shareChat.id ? { ...c, visibility: targetVisibility } : c),
    }));
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
    if (pathname.startsWith("/settings/api-keys")) return "Settings > API Keys";
    if (pathname.startsWith("/settings/access")) return "Settings > Access";
    if (pathname.startsWith("/settings/preferences")) return "Settings > Preferences";
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
    const match = pathname.match(/^\/(?:chat|share)\/([^/]+)/);
    return match ? match[1] : null;
  }, [explicitChatId, pathname]);

  const userDisplayName =
    userSession?.user?.user_metadata?.full_name ||
    userSession?.user?.email?.split("@")[0] ||
    "Developer";

  // Fetch sidebar chats (seeded with server-side initialChats)
  const { data: chatData } = useQuery<{ chats: SidebarChat[] }>({
    queryKey: ["sidebar-chats"],
    queryFn: async () => {
      const res = await fetch("/api/chats");
      if (!res.ok) return { chats: [] };
      return res.json();
    },
    initialData: initialChats && initialChats.length > 0 ? { chats: initialChats } : undefined,
    enabled: Boolean(userSession?.user),
    staleTime: 5_000,
    refetchOnWindowFocus: true,
  });
  const allChats = chatData?.chats ?? [];

  // Listen to chat lifecycle events
  useEffect(() => {
    const handleInvalidate = () => {
      queryClient.invalidateQueries({ queryKey: ["sidebar-chats"] });
    };

    window.addEventListener("chat:created", handleInvalidate);
    window.addEventListener("chat:updated", handleInvalidate);
    window.addEventListener("chat:title", handleInvalidate);

    return () => {
      window.removeEventListener("chat:created", handleInvalidate);
      window.removeEventListener("chat:updated", handleInvalidate);
      window.removeEventListener("chat:title", handleInvalidate);
    };
  }, [queryClient]);

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/chats?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      return id;
    },
    onSuccess: (id) => {
      queryClient.setQueryData<{ chats: SidebarChat[] }>(["sidebar-chats"], (old) => ({
        chats: (old?.chats ?? []).filter((c) => c.id !== id),
      }));
      toast.success("Chat deleted");
      if (pathname === `/chat/${id}`) {
        router.push("/chat");
      }
    },
    onError: () => toast.error("Failed to delete chat"),
  });

  // Pin/unpin mutation
  const pinMutation = useMutation({
    mutationFn: async ({ id, pinned }: { id: string; pinned: boolean }) => {
      const res = await fetch(`/api/chats?id=${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_pinned: pinned }),
      });
      if (!res.ok) throw new Error("Failed to update");
      return { id, pinned };
    },
    onSuccess: ({ id, pinned }) => {
      queryClient.setQueryData<{ chats: SidebarChat[] }>(["sidebar-chats"], (old) => ({
        chats: (old?.chats ?? []).map((c) => c.id === id ? { ...c, is_pinned: pinned } : c),
      }));
      toast.success(pinned ? "Chat pinned" : "Chat unpinned");
    },
    onError: () => toast.error("Failed to update chat"),
  });

  // Rename mutation
  const renameMutation = useMutation({
    mutationFn: async ({ id, title }: { id: string; title: string }) => {
      const res = await fetch(`/api/chats?id=${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) throw new Error("Failed to rename");
      return { id, title };
    },
    onSuccess: ({ id, title }) => {
      queryClient.setQueryData<{ chats: SidebarChat[] }>(["sidebar-chats"], (old) => ({
        chats: (old?.chats ?? []).map((c) => c.id === id ? { ...c, title } : c),
      }));
      toast.success("Chat renamed");
      setEditingChat(null);
    },
    onError: () => toast.error("Failed to rename chat"),
  });

  // Filter and group chats
  const { pinned, todayChats, yesterdayChats, olderChats, totalFiltered } = useMemo(() => {
    const q = chatSearch.toLowerCase().trim();
    const filtered = allChats
      .filter((c) => !q || (c.title || "New Chat").toLowerCase().includes(q))
      .sort((a, b) => {
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

    for (const chat of filtered) {
      if (chat.is_pinned) {
        pinned.push(chat);
      } else {
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

    return {
      pinned,
      todayChats,
      yesterdayChats,
      olderChats,
      totalFiltered: filtered.length,
    };
  }, [allChats, chatSearch]);

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
            "h-11 flex items-center shrink-0 border-b border-sidebar-border/40",
            isMobile
              ? "justify-between px-3"
              : isExpanded
                ? "justify-between px-3"
                : "justify-center"
          )}
        >
          {isExpanded && (
            <Link
              href="/mcp?tab=home"
              onClick={() => isMobile && setMobileDrawerOpen(false)}
              className="flex items-center gap-1.5 select-none hover:opacity-85 transition-opacity"
            >
              <span className="text-[15px] font-bold tracking-tight text-foreground">
                MCP <span className="font-semibold text-foreground/80">Assistant</span>
              </span>
            </Link>
          )}

          {isMobile ? (
            <SimpleTooltip content="Close menu" side="bottom">
              <button
                onClick={() => setMobileDrawerOpen(false)}
                className="p-1 rounded-sm text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors cursor-pointer"
                aria-label="Close navigation menu"
              >
                <X className="size-4" />
              </button>
            </SimpleTooltip>
          ) : (
            <SimpleTooltip content="Toggle sidebar" side="bottom">
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="p-1 rounded-sm text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors cursor-pointer"
                aria-label="Toggle sidebar"
              >
                {sidebarOpen ? (
                  <PanelLeftClose className="size-4" />
                ) : (
                  <PanelLeftOpen className="size-4" />
                )}
              </button>
            </SimpleTooltip>
          )}
        </div>

        {/* Nav */}
        <div
          className={cn(
            "flex-1 overflow-y-auto space-y-0.5 scrollbar-minimal",
            isExpanded ? "px-2 py-1.5" : "px-1 py-1.5"
          )}
        >
          {/* Main Links */}
          <SimpleTooltip content={!isExpanded ? "Home" : null} side="right">
            <Link
              href="/mcp?tab=home"
              onClick={() => isMobile && setMobileDrawerOpen(false)}
              className={cn(
                "w-full flex items-center gap-2.5 rounded-sm text-[13px] font-medium transition-all text-left",
                isExpanded ? "px-2.5 py-1.5" : "justify-center h-8 w-full p-0",
                currentNav === "home"
                  ? "bg-sidebar-accent text-sidebar-foreground font-semibold shadow-2xs"
                  : "text-sidebar-foreground/75 hover:text-sidebar-foreground hover:bg-sidebar-accent/60"
              )}
            >
              <Home className="size-4 shrink-0" />
              {isExpanded && <span>Home</span>}
            </Link>
          </SimpleTooltip>

          <SimpleTooltip content={!isExpanded ? "Apps" : null} side="right">
            <Link
              href="/mcp?tab=apps"
              onClick={() => isMobile && setMobileDrawerOpen(false)}
              className={cn(
                "w-full flex items-center gap-2.5 rounded-sm text-[13px] font-medium transition-all text-left",
                isExpanded ? "px-2.5 py-1.5" : "justify-center h-8 w-full p-0",
                currentNav === "apps"
                  ? "bg-sidebar-accent text-sidebar-foreground font-semibold shadow-2xs"
                  : "text-sidebar-foreground/75 hover:text-sidebar-foreground hover:bg-sidebar-accent/60"
              )}
            >
              <LayoutGrid className="size-4 shrink-0" />
              {isExpanded && <span>Apps</span>}
            </Link>
          </SimpleTooltip>

          {/* New Chat */}
          <SimpleTooltip content={!isExpanded ? "New Chat" : null} side="right">
            <Link
              href="/chat"
              onClick={() => isMobile && setMobileDrawerOpen(false)}
              className={cn(
                "w-full flex items-center gap-2.5 rounded-sm text-[13px] font-medium transition-all text-left",
                isExpanded ? "px-2.5 py-1.5" : "justify-center h-8 w-full p-0",
                currentNav === "chat" && !currentChatId
                  ? "bg-sidebar-accent text-sidebar-foreground font-semibold shadow-2xs"
                  : "text-sidebar-foreground/75 hover:text-sidebar-foreground hover:bg-sidebar-accent/60"
              )}
            >
              <SquarePen className="size-4 shrink-0" />
              {isExpanded && <span>New Chat</span>}
            </Link>
          </SimpleTooltip>

          {/* History */}
          {isExpanded && allChats.length > 0 && (
            <div className="pt-0.5">
              <button
                onClick={() => setHistoryOpen((o) => !o)}
                className="w-full flex items-center justify-between px-2.5 py-1.5 text-[13px] font-medium text-sidebar-foreground hover:bg-sidebar-accent/50 rounded-sm transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <Clock className="size-4 text-sidebar-foreground/60" />
                  <span>History</span>
                </div>
                {historyOpen ? (
                  <ChevronDown className="size-4 text-sidebar-foreground/60" />
                ) : (
                  <ChevronRight className="size-4 text-sidebar-foreground/60" />
                )}
              </button>

              {historyOpen && (
                <div className="mt-1 space-y-1">
                  <p className="px-1.5 pt-0.5 text-[10px] font-mono uppercase tracking-wider text-sidebar-foreground/60 font-medium">
                    Your Chats
                  </p>
                  <div className="relative px-0.5">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-sidebar-foreground/50" />
                    <input
                      type="text"
                      placeholder="Search chats"
                      value={chatSearch}
                      onChange={(e) => setChatSearch(e.target.value)}
                      className="w-full h-7.5 pl-7 pr-2.5 text-xs bg-sidebar-accent/40 border border-sidebar-border rounded-sm text-sidebar-foreground placeholder:text-sidebar-foreground/50 focus:outline-none focus:border-sidebar-foreground/40 transition-colors font-sans"
                    />
                  </div>

                  {/* Pinned */}
                  {pinned.length > 0 && (
                    <div>
                      <p className="px-1.5 py-0.5 pt-1 text-[10px] font-mono uppercase tracking-wider text-sidebar-foreground/60 font-medium">
                        Pinned
                      </p>
                      <div className="space-y-0.5 px-0.5">
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
                        {olderChats.slice(0, 30).map((chat) => (
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

                  {totalFiltered === 0 && chatSearch && (
                    <p className="px-2 py-2 text-[11px] text-sidebar-foreground/60 font-mono text-center">
                      No chats found
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Profile */}
        <div
          className={cn(
            "pt-2 pb-3 border-t border-sidebar-border bg-sidebar shrink-0",
            isExpanded ? "px-2" : "px-0"
          )}
        >
          {userSession?.user && (
            <ProfileDropdown
              user={userSession.user}
              trigger={
                <div
                  className={cn(
                    "w-full flex items-center gap-2 rounded-sm py-0.5 cursor-pointer transition-colors hover:bg-sidebar-accent",
                    isExpanded ? "px-1" : "justify-center px-0"
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
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-foreground truncate">{userDisplayName}</p>
                      {userSession.user?.email && (
                        <p className="text-[10px] text-muted-foreground truncate font-mono">
                          {userSession.user.email}
                        </p>
                      )}
                    </div>
                  )}
                  {isExpanded && (
                    <ChevronRight className="size-[18px] shrink-0 text-muted-foreground" strokeWidth={2} aria-hidden />
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
    <div className="flex h-screen w-full bg-sidebar text-foreground overflow-hidden font-sans select-none antialiased p-1.5 sm:p-2 gap-0 lg:gap-2">
      <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />

      {/* Rename Dialog */}
      {editingChat && (
        <Dialog open={Boolean(editingChat)} onOpenChange={(open) => !open && setEditingChat(null)}>
          <DialogContent className="sm:max-w-sm p-4 bg-card border-border rounded-sm">
            <DialogHeader>
              <DialogTitle className="text-sm font-medium text-foreground">Rename Chat</DialogTitle>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (editingChat.title.trim()) {
                  renameMutation.mutate({ id: editingChat.id, title: editingChat.title.trim() });
                }
              }}
              className="space-y-3 pt-2"
            >
              <input
                type="text"
                value={editingChat.title}
                onChange={(e) => setEditingChat({ ...editingChat, title: e.target.value })}
                className="w-full h-8 px-2.5 text-xs bg-background border border-border rounded-sm text-foreground focus:outline-none focus:border-primary font-sans"
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditingChat(null)}
                  className="h-7 px-2.5 text-xs rounded-sm"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={renameMutation.isPending || !editingChat.title.trim()}
                  className="h-7 px-3 text-xs rounded-sm"
                >
                  Save
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* ── Desktop Sidebar (hidden on <lg) ── */}
      <aside
        className={cn(
          "hidden lg:flex h-full bg-sidebar text-sidebar-foreground flex-col transition-all duration-150 shrink-0 z-30",
          sidebarOpen ? "w-64" : "w-12"
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
        <header className="h-14 border-b border-border bg-background px-4 sm:px-6 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center shrink-0 z-20 rounded-t-lg">
          <div className="flex items-center gap-2.5 min-w-0 justify-self-start">
            {/* Mobile Menu Hamburger Toggle */}
            <SimpleTooltip content="Open navigation menu" side="bottom">
              <button
                type="button"
                onClick={() => setMobileDrawerOpen(true)}
                className="lg:hidden p-1.5 -ml-1 rounded-sm text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
                aria-label="Open navigation menu"
              >
                <PanelLeftOpen className="size-[18px]" />
              </button>
            </SimpleTooltip>

            {computedBreadcrumb && (
              <span className="text-xs font-mono text-muted-foreground truncate">{computedBreadcrumb}</span>
            )}
          </div>
          <div className="flex items-center justify-self-center min-w-0">
            {headerActions || (
              <button
                onClick={() => setSearchOpen(true)}
                className="hidden md:flex items-center gap-2.5 h-9 text-sm font-sans text-muted-foreground hover:text-ink rounded-sm transition-colors"
              >
                <Search className="size-4 shrink-0" />
                <span className="flex-1 text-left truncate">Search pages and apps...</span>
                <kbd className="inline-flex h-5 items-center rounded border border-border bg-background px-1.5 font-mono text-[10px] select-none shrink-0">⌘K</kbd>
              </button>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0 justify-self-end">
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

      {/* Share Dialog */}
      <ShareConversationDialog
        open={Boolean(shareChat)}
        onOpenChange={(open) => {
          if (!open) {
            setShareChat(null);
            setShareCopyMessage(null);
          }
        }}
        chatId={shareChat?.id}
        shareVisibility={shareVisibility}
        shareCopyMessage={shareCopyMessage}
        onVisibilityChange={setShareVisibility}
        onSaveShare={handleSaveShare}
        onCopyShareLink={handleCopyShareLink}
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
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (editingChat && editingChat.title.trim()) {
                renameMutation.mutate({ id: editingChat.id, title: editingChat.title.trim() });
              }
            }}
            className="space-y-4 pt-2"
          >
            <input
              type="text"
              value={editingChat?.title || ""}
              onChange={(e) =>
                setEditingChat((prev) => (prev ? { ...prev, title: e.target.value } : null))
              }
              className="w-full h-9 px-3 text-xs bg-background border border-border rounded-sm text-foreground focus:outline-none focus:border-primary font-sans"
              placeholder="Enter new chat title"
              autoFocus
            />
            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setEditingChat(null)}
                className="h-8 px-3 text-xs cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={!editingChat?.title?.trim()}
                className="h-8 px-3 text-xs cursor-pointer"
              >
                Save
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
