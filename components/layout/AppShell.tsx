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
} from "lucide-react";
import Image from "next/image";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ThemeToggle } from "@/components/common/ThemeToggle";
import { ProfileDropdown } from "@/components/common/ProfileDropdown";
import { useAuth } from "@/components/providers/AuthProvider";
import { SearchDialog } from "@/components/layout/SearchDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "react-hot-toast";
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
}

function ChatContextMenu({ chat, onDelete, onTogglePin, onRename }: ChatMenuProps) {
  const handleShare = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const url = `${window.location.origin}/chat/${chat.id}`;
    navigator.clipboard.writeText(url);
    toast.success("Chat link copied to clipboard");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
          className="opacity-0 group-hover:opacity-100 p-1 rounded-sm text-muted-foreground hover:text-foreground hover:bg-card/80 transition-all"
          title="More options"
        >
          <MoreHorizontal className="size-[18px]" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={4}
        className="w-44 text-[12px] font-sans"
      >
        <DropdownMenuItem
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onTogglePin(chat.id, !chat.is_pinned); }}
          className="gap-2 py-1.5"
        >
          {chat.is_pinned ? <PinOff className="size-[18px] text-muted-foreground" /> : <Pin className="size-[18px] text-muted-foreground" />}
          {chat.is_pinned ? "Unpin chat" : "Pin chat"}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onRename(chat.id, chat.title || "New Chat");
          }}
          className="gap-2 py-1.5"
        >
          <Pencil className="size-[18px] text-muted-foreground" />
          Rename
        </DropdownMenuItem>
        <DropdownMenuItem asChild className="gap-2 py-1.5">
          <a
            href={`/chat/${chat.id}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink className="size-[18px] text-muted-foreground" />
            Open in new tab
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleShare} className="gap-2 py-1.5">
          <Share2 className="size-[18px] text-muted-foreground" />
          Share
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(chat.id); }}
          className="gap-2 py-1.5"
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
}: {
  chat: SidebarChat;
  isActive: boolean;
  onDelete: (id: string) => void;
  onTogglePin: (id: string, pinned: boolean) => void;
  onRename: (id: string, title: string) => void;
}) {
  return (
    <Link
      href={`/chat/${chat.id}`}
      className={cn(
        "group flex items-start justify-between gap-1 px-2 py-1.5 rounded-sm transition-colors",
        isActive
          ? "bg-card/80 text-foreground"
          : "text-muted-foreground hover:text-foreground hover:bg-card/50"
      )}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          {chat.is_pinned && (
            <Pin className="size-[18px] shrink-0 text-muted-foreground" />
          )}
          <p className="text-[13px] font-medium leading-snug truncate">
            {chat.title || "New Chat"}
          </p>
        </div>
        <p className="text-[10px] font-mono text-muted-foreground/70 mt-0.5">
          {formatChatDate(chat.updated_at || chat.created_at)}
        </p>
      </div>
      <ChatContextMenu chat={chat} onDelete={onDelete} onTogglePin={onTogglePin} onRename={onRename} />
    </Link>
  );
}

/* ─── AppShell ──────────────────────────────────────────────────────────────── */

interface AppShellProps {
  children: ReactNode;
  activeNav?: "home" | "apps" | "chat" | "settings";
  titleBreadcrumb?: string;
  headerActions?: ReactNode;
}

export function AppShell({ children, activeNav, titleBreadcrumb, headerActions }: AppShellProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { userSession } = useAuth();
  const queryClient = useQueryClient();

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(true);
  const [chatSearch, setChatSearch] = useState("");
  const [editingChat, setEditingChat] = useState<{ id: string; title: string } | null>(null);

  const tabParam = searchParams.get("tab");

  const currentNav = useMemo(() => {
    if (activeNav) return activeNav;
    if (pathname.startsWith("/chat")) return "chat";
    if (pathname.startsWith("/settings")) return "settings";
    if (pathname.startsWith("/mcp")) {
      if (tabParam === "apps" || searchParams.get("view") === "app" || searchParams.has("server")) return "apps";
      return "home";
    }
    return "home";
  }, [activeNav, pathname, tabParam, searchParams]);

  const computedBreadcrumb = useMemo(() => {
    if (titleBreadcrumb) return titleBreadcrumb;
    if (pathname.startsWith("/chat")) return "Chat";
    if (pathname.startsWith("/settings/api-keys")) return "Settings > API Keys";
    if (pathname.startsWith("/settings/access")) return "Settings > Access";
    if (pathname.startsWith("/settings/preferences")) return "Settings > Preferences";
    if (pathname.startsWith("/settings/account")) return "Settings > Account";
    if (pathname.startsWith("/settings/connectors")) return "Settings > Connectors";
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
    const match = pathname.match(/^\/chat\/([^/]+)/);
    return match ? match[1] : null;
  }, [pathname]);

  const userDisplayName =
    userSession?.user?.user_metadata?.full_name ||
    userSession?.user?.email?.split("@")[0] ||
    "Developer";

  // Fetch sidebar chats
  const { data: chatData } = useQuery<{ chats: SidebarChat[] }>({
    queryKey: ["sidebar-chats"],
    queryFn: async () => {
      const res = await fetch("/api/chats");
      if (!res.ok) return { chats: [] };
      return res.json();
    },
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
  const { pinned, older } = useMemo(() => {
    const q = chatSearch.toLowerCase().trim();
    const filtered = allChats.filter((c) =>
      !q || (c.title || "New Chat").toLowerCase().includes(q)
    );
    return {
      pinned: filtered.filter((c) => c.is_pinned),
      older: filtered.filter((c) => !c.is_pinned),
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

  const navItemClass = (active: boolean) =>
    cn(
      "w-full flex items-center gap-3 px-3 py-2 rounded-sm text-[13px] font-medium transition-all text-left",
      !sidebarOpen && "justify-center px-0",
      active
        ? "bg-card text-foreground font-semibold"
        : "text-muted-foreground hover:text-foreground hover:bg-card/60"
    );

  return (
    <div className="flex h-screen w-full bg-background text-foreground overflow-hidden font-sans select-none antialiased p-2 gap-2">
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

      {/* ── Sidebar ── */}
      <aside className={cn(
        "h-full bg-background flex flex-col transition-all duration-150 shrink-0 z-30",
        sidebarOpen ? "w-64" : "w-14"
      )}>
        <div className="flex flex-col min-h-0 flex-1 overflow-hidden">

          {/* Brand */}
          <div className={cn("h-14 flex items-center shrink-0", sidebarOpen ? "justify-end px-4" : "justify-center")}>
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-1 rounded-sm text-muted-foreground hover:text-foreground hover:bg-card transition-colors"
              title="Toggle sidebar"
            >
              {sidebarOpen ? <PanelLeftClose className="size-[18px]" /> : <PanelLeftOpen className="size-[18px]" />}
            </button>
          </div>

          {/* Nav */}
          <div className="flex-1 overflow-y-auto p-3 space-y-1 scrollbar-minimal">

            {/* Main */}
            <Link href="/mcp?tab=home" className={navItemClass(currentNav === "home")}>
              <Home className="size-[18px] shrink-0" />
              {sidebarOpen && <span>Home</span>}
            </Link>
            <Link href="/mcp?tab=apps" className={navItemClass(currentNav === "apps")}>
              <LayoutGrid className="size-[18px] shrink-0" />
              {sidebarOpen && <span>Apps</span>}
            </Link>

            {/* ── New Chat ── */}
            <Link href="/chat" className={cn(navItemClass(currentNav === "chat" && !currentChatId), "mt-1")}>
              <SquarePen className="size-[18px] shrink-0" />
              {sidebarOpen && <span>New Chat</span>}
            </Link>

            {/* ── History ── */}
            {sidebarOpen && allChats.length > 0 && (
              <div className="pt-1">
                {/* History header */}
                <button
                  onClick={() => setHistoryOpen((o) => !o)}
                  className="w-full flex items-center justify-between px-3 py-1.5 text-[13px] font-medium text-foreground hover:bg-card/40 rounded-sm transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Clock className="size-[18px] text-muted-foreground" />
                    <span>History</span>
                  </div>
                  {historyOpen
                    ? <ChevronDown className="size-[18px] text-muted-foreground" />
                    : <ChevronRight className="size-[18px] text-muted-foreground" />
                  }
                </button>

                {historyOpen && (
                  <div className="mt-1 space-y-2">
                    {/* YOUR CHATS label + search */}
                    <p className="px-2 pt-1 text-[10px] font-mono uppercase tracking-widest text-muted-foreground/50 font-semibold">
                      Your Chats
                    </p>
                    <div className="relative px-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-[18px] text-muted-foreground/60" />
                      <input
                        type="text"
                        placeholder="Search chats"
                        value={chatSearch}
                        onChange={(e) => setChatSearch(e.target.value)}
                        className="w-full h-8 pl-8 pr-3 text-xs bg-card/60 border border-border rounded-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/40 transition-colors font-sans"
                      />
                    </div>

                    {/* Pinned */}
                    {pinned.length > 0 && (
                      <div>
                        <p className="px-2 py-1 text-[10px] font-mono uppercase tracking-widest text-muted-foreground/50 font-semibold">
                          Pinned
                        </p>
                        <div className="space-y-0.5 px-1">
                          {pinned.map((chat) => (
                            <ChatItem
                              key={chat.id}
                              chat={chat}
                              isActive={currentChatId === chat.id}
                              onDelete={(id) => deleteMutation.mutate(id)}
                              onTogglePin={(id, p) => pinMutation.mutate({ id, pinned: p })}
                              onRename={(id, title) => setEditingChat({ id, title })}
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Older */}
                    {older.length > 0 && (
                      <div>
                        <p className="px-2 py-1 text-[10px] font-mono uppercase tracking-widest text-muted-foreground/50 font-semibold">
                          Older
                        </p>
                        <div className="space-y-0.5 px-1 max-h-[26rem] overflow-y-auto scrollbar-minimal">
                          {older.slice(0, 30).map((chat) => (
                            <ChatItem
                              key={chat.id}
                              chat={chat}
                              isActive={currentChatId === chat.id}
                              onDelete={(id) => deleteMutation.mutate(id)}
                              onTogglePin={(id, p) => pinMutation.mutate({ id, pinned: p })}
                              onRename={(id, title) => setEditingChat({ id, title })}
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    {pinned.length === 0 && older.length === 0 && chatSearch && (
                      <p className="px-2 py-2 text-[11px] text-muted-foreground font-mono text-center">
                        No chats found
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Profile */}
          <div className={cn("pt-2 pb-3 border-t border-border bg-background shrink-0", sidebarOpen ? "px-2" : "px-0")}>
            {userSession?.user && (
              <ProfileDropdown
                user={userSession.user}
                trigger={
                  <div
                    className={cn("w-full flex items-center gap-2 rounded-sm py-0.5 cursor-pointer transition-colors hover:bg-card", sidebarOpen ? "px-1" : "justify-center px-0")}
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
                    {sidebarOpen && (
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-foreground truncate">{userDisplayName}</p>
                        {userSession.user?.email && (
                          <p className="text-[10px] text-muted-foreground truncate font-mono">
                            {userSession.user.email}
                          </p>
                        )}
                      </div>
                    )}
                    {sidebarOpen && (
                      <ChevronRight className="size-[18px] shrink-0 text-muted-foreground" strokeWidth={2} aria-hidden />
                    )}
                  </div>
                }
              />
            )}
          </div>
        </div>
      </aside>

      {/* ── Main ── */}
      <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden bg-background border border-border rounded-lg relative shadow-xs">
        <header className="h-14 border-b border-border bg-background px-6 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center shrink-0 z-20 rounded-t-lg">
          <div className="flex items-center gap-2 min-w-0 justify-self-start">
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
          <div className="flex items-center gap-2.5 shrink-0 justify-self-end">
            <ThemeToggle />
          </div>
        </header>
        <div className="flex-1 flex min-h-0 min-w-0 overflow-hidden relative rounded-b-lg">
          {children}
        </div>
      </div>
    </div>
  );
}
