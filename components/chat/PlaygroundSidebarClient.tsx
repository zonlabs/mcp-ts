"use client";

import { useEffect, useMemo, useState, type ComponentType } from "react";
import {
  ChevronRight,
  LogOut,
  SquarePen,
  PanelLeftOpen,
  PanelLeftClose,
  LayoutGrid,
  X,
  KeyRound,
  Lock,
  Globe,
  AlertTriangle,
  CheckCircle2,
  Plug,
  Search,
  MoreHorizontal,
  ArrowUpRight,
  Link,
  User,
  SlidersHorizontal,
  ExternalLink,
  Pin,
  PinOff,
  History,
  HelpCircle,
  MessageSquareText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import Image from "next/image";
import { useRouter, usePathname } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { useAuth } from "@/components/providers/AuthProvider";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "react-hot-toast";
import { getAppUrl } from "@/lib/url";
import { useI18n } from "@/lib/web-i18n";
import { signOutAndRedirect } from "@/components/common/SignOutButton";
import type { SidebarChat } from "@/lib/sidebar-chats";

type ChatGroup = {
  key: string;
  label: string;
  chats: SidebarChat[];
};

interface PlaygroundSidebarClientProps {
  initialChats: SidebarChat[];
}

type TranslateFn = ReturnType<typeof useI18n>["t"];
type SidebarSettingsLink = {
  label: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
};

export function PlaygroundSidebarClient({
  initialChats,
}: PlaygroundSidebarClientProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [chats, setChats] = useState<SidebarChat[]>(initialChats);
  const [chatQuery, setChatQuery] = useState("");
  const [activeChatMenuId, setActiveChatMenuId] = useState<string | null>(null);
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [isHistoryOpen, setIsHistoryOpen] = useState(true);
  const [isProfileSettingsOpen, setIsProfileSettingsOpen] = useState(false);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [shareChatId, setShareChatId] = useState<string | null>(null);
  const [shareVisibility, setShareVisibility] = useState<"PRIVATE" | "PUBLIC">("PRIVATE");
  const [isSavingShare, setIsSavingShare] = useState(false);
  const [shareCopyMessage, setShareCopyMessage] = useState<string | null>(null);
  const { userSession } = useAuth();
  const { t, language } = useI18n();
  const user = userSession?.user;
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    setChats(initialChats);
  }, [initialChats]);

  useEffect(() => {
    if (!user?.id) {
      setChats([]);
    }
  }, [user?.id]);

  const settingsLinks: SidebarSettingsLink[] = [
    { label: t("account"), href: "/settings/account", icon: User },
    { label: t("preferences"), href: "/settings/preferences", icon: SlidersHorizontal },
    { label: t("apiKeys"), href: "/settings/api-keys", icon: KeyRound },
  ];

  const userName = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "Guest";
  const userImage = user?.user_metadata?.avatar_url;

  const navigateTo = (path: string) => {
    router.push(path);
    setIsMobileMenuOpen(false);
  };

  const moveChatToTop = (detail: {
    chatId: string;
    title?: string | null;
    visibility?: string | null;
    isPinned?: boolean | null;
    updatedAt?: string;
    createdAt?: string;
  }) => {
    const timestamp = detail.updatedAt ?? new Date().toISOString();
    setChats((prev) => {
      const existing = prev.find((chat) => chat.id === detail.chatId);
      const nextChat: SidebarChat = {
        id: detail.chatId,
        title: detail.title ?? existing?.title ?? "New Chat",
        updated_at: timestamp,
        created_at: existing?.created_at ?? detail.createdAt ?? timestamp,
        visibility: detail.visibility ?? existing?.visibility,
        is_pinned: detail.isPinned ?? existing?.is_pinned ?? false,
      };

      return [nextChat, ...prev.filter((chat) => chat.id !== detail.chatId)];
    });
  };

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ chatId: string; title: string }>).detail;
      if (!detail?.chatId || !detail?.title) return;
      moveChatToTop(detail);
    };
    window.addEventListener("chat:title", handler as EventListener);
    return () => window.removeEventListener("chat:title", handler as EventListener);
  }, []);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{
        chatId: string;
        title?: string | null;
        visibility?: string | null;
        isPinned?: boolean | null;
        updatedAt?: string;
        createdAt?: string;
      }>).detail;
      if (!detail?.chatId) return;
      moveChatToTop(detail);
    };
    window.addEventListener("chat:created", handler as EventListener);
    return () => window.removeEventListener("chat:created", handler as EventListener);
  }, []);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{
        chatId: string;
        title?: string | null;
        visibility?: string | null;
        isPinned?: boolean | null;
        updatedAt?: string;
      }>).detail;
      if (!detail?.chatId) return;
      moveChatToTop(detail);
    };
    window.addEventListener("chat:updated", handler as EventListener);
    return () => window.removeEventListener("chat:updated", handler as EventListener);
  }, []);

  const getChatTimestamp = (chat: SidebarChat) => {
    const value = Date.parse(chat.updated_at || chat.created_at || "");
    return Number.isNaN(value) ? 0 : value;
  };

  const getAgeLabel = (chat: SidebarChat) => {
    const timestamp = getChatTimestamp(chat);
    if (!timestamp) return "";

    const diffMs = timestamp - Date.now();
    const absMs = Math.abs(diffMs);
    if (absMs < 60_000) return t("justNow");

    const formatter = new Intl.RelativeTimeFormat(language, { numeric: "auto" });
    if (absMs < 60 * 60_000) {
      return formatter.format(Math.round(diffMs / 60_000), "minute");
    }
    if (absMs < 24 * 60 * 60_000) {
      return formatter.format(Math.round(diffMs / (60 * 60_000)), "hour");
    }
    if (absMs < 30 * 24 * 60 * 60_000) {
      return formatter.format(Math.round(diffMs / (24 * 60 * 60_000)), "day");
    }

    const date = new Date(timestamp);
    return date.toLocaleDateString(language, {
      month: "short",
      day: "numeric",
      ...(date.getFullYear() !== new Date().getFullYear() ? { year: "numeric" } : {}),
    });
  };

  const getRecencyGroupKey = (chat: SidebarChat) => {
    const timestamp = getChatTimestamp(chat);
    if (!timestamp) return "older";

    const date = new Date(timestamp);
    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const startOfChatDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    const daysAgo = Math.floor((startOfToday - startOfChatDay) / 86_400_000);

    if (daysAgo <= 0) return "today";
    if (daysAgo === 1) return "yesterday";
    if (daysAgo <= 7) return "previous7";
    if (daysAgo <= 30) return "previous30";
    return "older";
  };

  const { pinnedChatGroups, unpinnedChatGroups, hasVisibleChats } = useMemo(() => {
    const query = chatQuery.trim().toLowerCase();
    const filtered = query
      ? chats.filter((chat) => (chat.title || "").toLowerCase().includes(query))
      : chats;

    const sorted = [...filtered].sort((a, b) => {
      if (Boolean(a.is_pinned) !== Boolean(b.is_pinned)) {
        return Number(Boolean(b.is_pinned)) - Number(Boolean(a.is_pinned));
      }
      return getChatTimestamp(b) - getChatTimestamp(a);
    });

    const labels: Record<string, string> = {
      pinned: t("pinnedChats"),
      today: t("todayChats"),
      yesterday: t("yesterdayChats"),
      previous7: t("previous7Days"),
      previous30: t("previous30Days"),
      older: t("olderChats"),
    };
    const order = ["pinned", "today", "yesterday", "previous7", "previous30", "older"];

    const toGroups = (items: SidebarChat[]) => {
      const groups = new Map<string, SidebarChat[]>();
      for (const chat of items) {
        const key = chat.is_pinned ? "pinned" : getRecencyGroupKey(chat);
        groups.set(key, [...(groups.get(key) ?? []), chat]);
      }
      return order
        .map((key) => ({ key, label: labels[key], chats: groups.get(key) ?? [] }))
        .filter((group) => group.chats.length > 0);
    };

    const pinned = sorted.filter((chat) => chat.is_pinned);
    const unpinned = sorted.filter((chat) => !chat.is_pinned);

    return {
      pinnedChatGroups: toGroups(pinned),
      unpinnedChatGroups: toGroups(unpinned),
      hasVisibleChats: pinned.length > 0 || unpinned.length > 0,
    };
  }, [chats, chatQuery, language, t]);

  const formatChatTitle = (title: string | null) => {
    const normalized = (title || "").trim();
    if (!normalized) return t("newChat");
    if (normalized.toLowerCase() === "anonymous chat") return t("newChat");
    if (normalized.toLowerCase() === "new chat") return t("newChat");
    return normalized;
  };

  const activeChatId = useMemo(() => {
    if (!pathname?.startsWith("/chat/")) return null;
    const segments = pathname.split("/");
    return segments[2] || null;
  }, [pathname]);

  const activeChatTitle = useMemo(() => {
    if (!activeChatId) return t("newChat");
    const activeChat = chats.find((chat) => chat.id === activeChatId);
    return formatChatTitle(activeChat?.title ?? null);
  }, [activeChatId, chats, t]);

  const handleRenameChat = (chatId: string) => {
    const current = chats.find((c) => c.id === chatId);
    const title = formatChatTitle(current?.title ?? null);
    setEditingChatId(chatId);
    setEditingTitle(title);
  };

  const handleSaveRenameChat = async (chatId: string) => {
    const trimmed = editingTitle.trim();
    setEditingChatId(null);
    if (!trimmed) return;

    const updatedAt = new Date().toISOString();
    moveChatToTop({ chatId, title: trimmed, updatedAt });
    const supabase = createClient();
    const { error } = await supabase
      .from("chats")
      .update({ title: trimmed, updated_at: updatedAt })
      .eq("id", chatId);
    if (error) {
      console.error("[PlaygroundSidebar] failed to rename chat:", error);
    }
  };

  const handleCancelRenameChat = () => {
    setEditingChatId(null);
    setEditingTitle("");
  };

  const handleDeleteChat = async (chatId: string) => {
    const supabase = createClient();
    const { error } = await supabase.from("chats").delete().eq("id", chatId);
    if (error) {
      console.error("[PlaygroundSidebar] failed to delete chat:", error);
      return;
    }

    setChats((prev) => prev.filter((c) => c.id !== chatId));
    if (pathname === `/chat/${chatId}`) {
      router.push("/chat");
    }
    toast.success(t("chatDeletedSuccessfully"));
  };

  const handleOpenShare = (chatId: string) => {
    const chat = chats.find((c) => c.id === chatId);
    const nextVisibility = (chat?.visibility || "PRIVATE") as "PRIVATE" | "PUBLIC";
    setShareChatId(chatId);
    setShareVisibility(nextVisibility);
    setIsShareOpen(true);
  };

  const handleOpenChatInNewTab = (chatId: string) => {
    window.open(`/chat/${chatId}`, "_blank", "noopener,noreferrer");
  };

  const handleTogglePinChat = async (chatId: string, isPinned: boolean) => {
    const chat = chats.find((c) => c.id === chatId);
    const nextPinned = !isPinned;
    const updatedAt = new Date().toISOString();
    moveChatToTop({
      chatId,
      title: chat?.title,
      visibility: chat?.visibility,
      isPinned: nextPinned,
      updatedAt,
    });

    const supabase = createClient();
    const { error } = await supabase
      .from("chats")
      .update({ is_pinned: nextPinned, updated_at: updatedAt })
      .eq("id", chatId);

    if (error) {
      console.error("[PlaygroundSidebar] failed to update pin:", error);
      moveChatToTop({
        chatId,
        title: chat?.title,
        visibility: chat?.visibility,
        isPinned,
        updatedAt: chat?.updated_at ?? updatedAt,
      });
    }
  };

  const handleSaveShare = async (nextVisibility?: "PRIVATE" | "PUBLIC") => {
    if (!shareChatId) return;
    setIsSavingShare(true);
    const targetVisibility = nextVisibility ?? shareVisibility;
    const supabase = createClient();
    const { error } = await supabase
      .from("chats")
      .update({ visibility: targetVisibility, updated_at: new Date().toISOString() })
      .eq("id", shareChatId);
    if (error) {
      console.error("[PlaygroundSidebar] failed to update share settings:", error);
      toast.error(t("failedToUpdateSharing"));
      setIsSavingShare(false);
      return;
    }
    setShareVisibility(targetVisibility);
    moveChatToTop({
      chatId: shareChatId,
      visibility: targetVisibility,
      updatedAt: new Date().toISOString(),
    });
    setIsSavingShare(false);
    toast.success(t("shareSettingsUpdated"));
  };

  const handleCopyShareLink = async () => {
    if (!shareChatId) return;
    if (shareVisibility !== "PUBLIC") {
      setShareCopyMessage(t("setPublicToShare"));
      setTimeout(() => setShareCopyMessage(null), 2000);
      return;
    }
    const baseUrl = typeof window !== "undefined" ? window.location.origin : getAppUrl();
    const shareUrl = `${baseUrl}/share/${shareChatId}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareCopyMessage(t("linkCopied"));
      setTimeout(() => setShareCopyMessage(null), 2000);
    } catch {
      setShareCopyMessage(t("failedToCopyLink"));
      setTimeout(() => setShareCopyMessage(null), 2000);
    }
  };

  const handleFeedbackClick = () => {
    window.open("https://github.com/zonlabs/mcp-ts/issues", "_blank", "noopener,noreferrer");
  };

  const renderSidebarContent = (
    expanded: boolean,
    onNavigate: (path: string) => void,
    onToggleSidebar: () => void,
    toggleLabel: string,
    profileMenuSide: "top" | "right",
    profileMenuAlign: "start" | "end"
  ) => (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <div
        className={cn(
          "flex flex-shrink-0 items-center px-3 pb-3 pt-3",
          expanded ? "justify-start" : "justify-center"
        )}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onToggleSidebar}
              className="group flex cursor-pointer items-center rounded-md p-2 transition-colors hover:bg-accent/50"
              aria-label={toggleLabel}
            >
              {expanded ? (
                <PanelLeftClose className="h-6 w-6 text-primary transition-colors group-hover:text-primary/80" />
              ) : (
                <PanelLeftOpen className="h-6 w-6 text-primary transition-colors group-hover:text-primary/80" />
              )}
            </button>
          </TooltipTrigger>
          {!expanded && (
            <TooltipContent side="right" sideOffset={8}>
              {toggleLabel}
            </TooltipContent>
          )}
        </Tooltip>
      </div>

      <div className={cn("flex-shrink-0 space-y-2 pb-3", expanded ? "px-2" : "px-1")}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => onNavigate("/mcp")}
              className={cn(
                "w-full cursor-pointer rounded-md py-2 text-sm font-medium transition-colors",
                expanded ? "flex items-center gap-3 px-3" : "flex justify-center px-0",
                pathname === "/mcp"
                  ? "text-primary hover:text-primary/80"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              )}
            >
              <LayoutGrid className="h-5 w-5 flex-shrink-0" />
              {expanded && <span className="truncate text-[16px]">{t("apps")}</span>}
            </button>
          </TooltipTrigger>
          {!expanded && (
            <TooltipContent side="right" sideOffset={8}>
              {t("apps")}
            </TooltipContent>
          )}
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => onNavigate("/chat")}
              className={cn(
                "w-full cursor-pointer rounded-md py-2 text-sm font-medium transition-colors",
                expanded ? "flex items-center gap-3 px-3" : "flex justify-center px-0",
                pathname === "/chat"
                  ? "text-primary hover:text-primary/80"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              )}
            >
              <SquarePen className="h-5 w-5 flex-shrink-0" />
              {expanded && <span className="truncate text-[16px]">{t("newChat")}</span>}
            </button>
          </TooltipTrigger>
          {!expanded && (
            <TooltipContent side="right" sideOffset={8}>
              {t("newChat")}
            </TooltipContent>
          )}
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => {
                if (!expanded) {
                  setIsOpen(true);
                  setIsHistoryOpen(true);
                } else {
                  setIsHistoryOpen((prev) => !prev);
                }
              }}
              className={cn(
                "w-full cursor-pointer rounded-md py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground",
                expanded ? "flex items-center gap-3 px-3" : "flex justify-center px-0"
              )}
            >
              <History className="h-5 w-5 flex-shrink-0" />
              {expanded && (
                <>
                  <span className="flex-1 truncate text-left text-[16px]">{t("chatHistory")}</span>
                  <ChevronRight
                    className={cn("h-4 w-4 transition-transform", isHistoryOpen ? "rotate-90" : "")}
                  />
                </>
              )}
            </button>
          </TooltipTrigger>
          {!expanded && (
            <TooltipContent side="right" sideOffset={8}>
              {t("chatHistory")}
            </TooltipContent>
          )}
        </Tooltip>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {expanded && (
          <SidebarHistoryPanel
            t={t}
            pathname={pathname}
            chatQuery={chatQuery}
            onChatQueryChange={setChatQuery}
            isHistoryOpen={isHistoryOpen}
            hasVisibleChats={hasVisibleChats}
            pinnedChatGroups={pinnedChatGroups}
            unpinnedChatGroups={unpinnedChatGroups}
            editingChatId={editingChatId}
            editingTitle={editingTitle}
            onEditingTitleChange={setEditingTitle}
            activeChatMenuId={activeChatMenuId}
            onActiveChatMenuChange={setActiveChatMenuId}
            onNavigate={onNavigate}
            formatChatTitle={formatChatTitle}
            getAgeLabel={getAgeLabel}
            onSaveRenameChat={handleSaveRenameChat}
            onCancelRenameChat={handleCancelRenameChat}
            onTogglePinChat={handleTogglePinChat}
            onRenameChat={handleRenameChat}
            onOpenChatInNewTab={handleOpenChatInNewTab}
            onOpenShare={handleOpenShare}
            onDeleteChat={handleDeleteChat}
          />
        )}
      </div>

      <div className="bg-background p-3 flex-shrink-0">
        <SidebarProfileDropdown
          expanded={expanded}
          onNavigate={onNavigate}
          menuSide={profileMenuSide}
          menuAlign={profileMenuAlign}
          t={t}
          userName={userName}
          userEmail={user?.email ?? null}
          userImage={userImage}
          settingsLinks={settingsLinks}
          isProfileSettingsOpen={isProfileSettingsOpen}
          onProfileSettingsOpenChange={setIsProfileSettingsOpen}
          onFeedbackClick={handleFeedbackClick}
        />
      </div>
    </div>
  );

  return (
    <>
      <div className="h-14 border-b border-border/60 bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/70 md:hidden flex items-center justify-between">
        <button
          onClick={() => setIsMobileMenuOpen(true)}
          className="flex h-9 w-9 items-center justify-center rounded-md transition-colors hover:bg-accent"
          aria-label={t("openNavigationMenu")}
        >
          <PanelLeftOpen className="h-5 w-5 text-foreground" />
        </button>
        <button onClick={() => router.push("/chat")} className="text-sm font-medium text-foreground">
          {activeChatTitle}
        </button>
        <button
          onClick={() => router.push("/chat")}
          className="flex h-9 w-9 items-center justify-center rounded-md transition-colors hover:bg-accent"
          aria-label={t("newChat")}
        >
          <SquarePen className="h-5 w-5 text-foreground" />
        </button>
      </div>

      <Dialog open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
        <DialogContent
          className="block h-[100dvh] w-80 max-w-[85vw] overflow-hidden rounded-none border-y-0 border-l-0 border-r border-border/60 p-0 md:hidden left-0 top-0 translate-x-0 translate-y-0"
          showCloseButton={false}
        >
          {renderSidebarContent(
            true,
            navigateTo,
            () => setIsMobileMenuOpen(false),
            t("closeNavigationMenu"),
            "top",
            "start"
          )}
        </DialogContent>
      </Dialog>

      <SidebarShareDialog
        open={isShareOpen}
        onOpenChange={setIsShareOpen}
        t={t}
        shareVisibility={shareVisibility}
        shareCopyMessage={shareCopyMessage}
        onVisibilityChange={setShareVisibility}
        onSaveShare={handleSaveShare}
        onCopyShareLink={handleCopyShareLink}
      />

      <div className="relative hidden md:flex">
        <div
          className={cn(
            "h-full min-h-0 bg-background transition-all duration-300 ease-in-out",
            isOpen ? "w-64" : "w-16"
          )}
        >
          {renderSidebarContent(
            isOpen,
            router.push,
            () => setIsOpen((prev) => !prev),
            t("toggleSidebar"),
            "right",
            isOpen ? "start" : "end"
          )}
        </div>
      </div>
    </>
  );
}

interface SidebarProfileDropdownProps {
  expanded: boolean;
  onNavigate: (path: string) => void;
  menuSide: "top" | "right";
  menuAlign: "start" | "end";
  t: TranslateFn;
  userName: string;
  userEmail: string | null;
  userImage?: string | null;
  settingsLinks: SidebarSettingsLink[];
  isProfileSettingsOpen: boolean;
  onProfileSettingsOpenChange: (open: boolean) => void;
  onFeedbackClick: () => void;
}

function SidebarProfileDropdown({
  expanded,
  onNavigate,
  menuSide,
  menuAlign,
  t,
  userName,
  userEmail,
  userImage,
  settingsLinks,
  isProfileSettingsOpen,
  onProfileSettingsOpenChange,
  onFeedbackClick,
}: SidebarProfileDropdownProps) {
  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (!open) onProfileSettingsOpenChange(false);
      }}
    >
      <Tooltip>
        <DropdownMenuTrigger asChild>
          <TooltipTrigger asChild>
            <button
              className={cn(
                "w-full cursor-pointer rounded-md transition-colors hover:bg-accent",
                expanded ? "flex items-center gap-3 p-2" : "flex items-center justify-center p-2"
              )}
            >
              {userImage ? (
                <Image
                  src={userImage}
                  alt={userName}
                  width={expanded ? 40 : 32}
                  height={expanded ? 40 : 32}
                  className="rounded-full flex-shrink-0"
                />
              ) : (
                <div
                  className={cn(
                    "flex flex-shrink-0 items-center justify-center rounded-full bg-orange-500 font-semibold text-white",
                    expanded ? "h-10 w-10" : "h-8 w-8 text-sm"
                  )}
                >
                  {userName.charAt(0).toUpperCase()}
                </div>
              )}
              {expanded && (
                <>
                  <div className="flex flex-1 flex-col items-start overflow-hidden">
                    <span className="w-full truncate text-sm font-medium">{userName}</span>
                    {userEmail && <span className="w-full truncate text-xs text-muted-foreground">{userEmail}</span>}
                  </div>
                  <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                </>
              )}
            </button>
          </TooltipTrigger>
        </DropdownMenuTrigger>
        {!expanded && (
          <TooltipContent side="right" sideOffset={8}>
            {t("account")}
          </TooltipContent>
        )}
      </Tooltip>

      <DropdownMenuContent
        align={menuAlign}
        side={menuSide}
        sideOffset={8}
        collisionPadding={12}
        className="w-56 max-w-[calc(100vw-1rem)] rounded-xl p-2"
      >
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault();
            onProfileSettingsOpenChange(!isProfileSettingsOpen);
          }}
          className="gap-2 rounded-md"
        >
          <SlidersHorizontal className="h-4 w-4" />
          <span>{t("settings")}</span>
          <ChevronRight
            className={cn(
              "ml-auto h-4 w-4 transition-transform",
              isProfileSettingsOpen ? "rotate-90" : ""
            )}
          />
        </DropdownMenuItem>

        {isProfileSettingsOpen && (
          <div className="mb-1 ml-2 border-l border-border/60 pl-2">
            {settingsLinks.map((link) => {
              const Icon = link.icon;
              return (
                <DropdownMenuItem
                  key={link.href}
                  onClick={() => {
                    onProfileSettingsOpenChange(false);
                    onNavigate(link.href);
                  }}
                  className="gap-2 rounded-md"
                >
                  <Icon className="h-4 w-4" />
                  <span>{link.label}</span>
                </DropdownMenuItem>
              );
            })}
          </div>
        )}

        <DropdownMenuItem onClick={() => onNavigate("/faq")} className="gap-2 rounded-md">
          <HelpCircle className="h-4 w-4" />
          <span>{t("help")}</span>
        </DropdownMenuItem>

        <DropdownMenuItem onClick={onFeedbackClick} className="gap-2 rounded-md">
          <MessageSquareText className="h-4 w-4" />
          <span>{t("feedback")}</span>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          variant="destructive"
          onClick={() => void signOutAndRedirect()}
          className="gap-2 rounded-md"
        >
          <LogOut className="h-4 w-4" />
          <span>{t("signOut")}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface SidebarHistoryPanelProps {
  t: TranslateFn;
  pathname: string | null;
  chatQuery: string;
  onChatQueryChange: (value: string) => void;
  isHistoryOpen: boolean;
  hasVisibleChats: boolean;
  pinnedChatGroups: ChatGroup[];
  unpinnedChatGroups: ChatGroup[];
  editingChatId: string | null;
  editingTitle: string;
  onEditingTitleChange: (value: string) => void;
  activeChatMenuId: string | null;
  onActiveChatMenuChange: (value: string | null) => void;
  onNavigate: (path: string) => void;
  formatChatTitle: (title: string | null) => string;
  getAgeLabel: (chat: SidebarChat) => string;
  onSaveRenameChat: (chatId: string) => void;
  onCancelRenameChat: () => void;
  onTogglePinChat: (chatId: string, isPinned: boolean) => void;
  onRenameChat: (chatId: string) => void;
  onOpenChatInNewTab: (chatId: string) => void;
  onOpenShare: (chatId: string) => void;
  onDeleteChat: (chatId: string) => void;
}

function SidebarHistoryPanel({
  t,
  pathname,
  chatQuery,
  onChatQueryChange,
  isHistoryOpen,
  hasVisibleChats,
  pinnedChatGroups,
  unpinnedChatGroups,
  editingChatId,
  editingTitle,
  onEditingTitleChange,
  activeChatMenuId,
  onActiveChatMenuChange,
  onNavigate,
  formatChatTitle,
  getAgeLabel,
  onSaveRenameChat,
  onCancelRenameChat,
  onTogglePinChat,
  onRenameChat,
  onOpenChatInNewTab,
  onOpenShare,
  onDeleteChat,
}: SidebarHistoryPanelProps) {
  const renderChatGroups = (groups: ChatGroup[]) => (
    <>
      {groups.map((group) => (
        <div key={group.key} className="space-y-1">
          <div className="px-2 pb-1 pt-3 text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground/70">
            {group.label}
          </div>
          {group.chats.map((chat) => (
            <div
              key={chat.id}
              className={cn(
                "group flex items-center gap-2 rounded-lg border border-transparent px-2.5 py-2 text-sm transition-colors",
                pathname === `/chat/${chat.id}`
                  ? "border-border/50 bg-accent/70 text-foreground"
                  : "text-muted-foreground hover:border-border/40 hover:bg-muted/40 hover:text-foreground"
              )}
            >
              <div className="min-w-0 flex-1">
                {editingChatId === chat.id ? (
                  <input
                    value={editingTitle}
                    onChange={(e) => onEditingTitleChange(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        onSaveRenameChat(chat.id);
                      }
                      if (e.key === "Escape") {
                        e.preventDefault();
                        onCancelRenameChat();
                      }
                    }}
                    onBlur={() => onSaveRenameChat(chat.id)}
                    autoFocus
                    className="w-full rounded-md border border-border/60 bg-transparent px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                ) : (
                  <button onClick={() => onNavigate(`/chat/${chat.id}`)} className="w-full text-left">
                    <span className="flex items-center gap-1.5">
                      {chat.is_pinned && <Pin className="h-3 w-3 shrink-0 fill-current" />}
                      <span className="block truncate text-[15px]">{formatChatTitle(chat.title)}</span>
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] text-muted-foreground/70">
                      {getAgeLabel(chat)}
                    </span>
                  </button>
                )}
              </div>
              <DropdownMenu onOpenChange={(open) => onActiveChatMenuChange(open ? chat.id : null)}>
                <DropdownMenuTrigger asChild>
                  <button
                    className={cn(
                      "flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground/80 transition-all hover:bg-background/80 hover:text-foreground",
                      activeChatMenuId === chat.id
                        ? "opacity-100"
                        : "opacity-45 group-hover:opacity-100"
                    )}
                    aria-label={t("chatActions")}
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="w-48 rounded-xl border border-border/70 bg-background/95 p-2 shadow-xl"
                >
                  <DropdownMenuItem
                    onClick={() => onTogglePinChat(chat.id, Boolean(chat.is_pinned))}
                    className="gap-2 rounded-md px-2 py-2 text-sm"
                  >
                    {chat.is_pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                    {chat.is_pinned ? t("unpinChat") : t("pinChat")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => onRenameChat(chat.id)}
                    className="gap-2 rounded-md px-2 py-2 text-sm"
                  >
                    <SquarePen className="h-4 w-4" />
                    {t("rename")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => onOpenChatInNewTab(chat.id)}
                    className="gap-2 rounded-md px-2 py-2 text-sm"
                  >
                    <ExternalLink className="h-4 w-4" />
                    {t("openInNewTab")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => onOpenShare(chat.id)}
                    className="gap-2 rounded-md px-2 py-2 text-sm"
                  >
                    <ArrowUpRight className="h-4 w-4" />
                    {t("share")}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="my-1" />
                  <DropdownMenuItem
                    onClick={() => onDeleteChat(chat.id)}
                    className="gap-2 rounded-md px-2 py-2 text-sm text-destructive focus:text-destructive"
                  >
                    <X className="h-4 w-4" />
                    {t("delete")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
        </div>
      ))}
    </>
  );

  return (
    <>
      <div className="px-3 pb-3">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-mono font-medium uppercase tracking-wider text-muted-foreground/80">
            <span>{t("yourChats")}</span>
          </div>
          <div className="relative mt-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
            <input
              value={chatQuery}
              onChange={(e) => onChatQueryChange(e.target.value)}
              placeholder={t("searchChats")}
              className="w-full rounded-md border border-border/60 bg-background/60 py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
        </div>
      </div>
      <div className="flex-1 min-h-0 space-y-1 overflow-y-auto overscroll-contain px-2 pb-2">
        {!hasVisibleChats && (
          <div className="px-2 py-2 text-xs text-muted-foreground">{t("noChatsYet")}</div>
        )}
        {hasVisibleChats && isHistoryOpen && (
          <>
            {renderChatGroups(pinnedChatGroups)}
            {renderChatGroups(unpinnedChatGroups)}
          </>
        )}
      </div>
    </>
  );
}

interface SidebarShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  t: TranslateFn;
  shareVisibility: "PRIVATE" | "PUBLIC";
  shareCopyMessage: string | null;
  onVisibilityChange: (value: "PRIVATE" | "PUBLIC") => void;
  onSaveShare: (nextVisibility?: "PRIVATE" | "PUBLIC") => Promise<void>;
  onCopyShareLink: () => Promise<void>;
}

function SidebarShareDialog({
  open,
  onOpenChange,
  t,
  shareVisibility,
  shareCopyMessage,
  onVisibilityChange,
  onSaveShare,
  onCopyShareLink,
}: SidebarShareDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-h-[85vh] max-w-xs overflow-y-auto border-border/70 bg-background p-5 text-foreground shadow-2xl sm:max-w-sm">
        <div className="space-y-5">
          <DialogHeader className="space-y-1 pr-6">
            <DialogTitle className="text-lg font-semibold leading-none">{t("shareConversation")}</DialogTitle>
          </DialogHeader>

          <div className="flex items-start gap-3 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-3 text-amber-700 dark:text-amber-300">
            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-amber-500/10">
              <AlertTriangle className="h-4 w-4" />
            </div>
            <p className="text-xs font-medium leading-5">{t("shareWarning")}</p>
          </div>

          <div className="space-y-2">
            {([
              { value: "PRIVATE", label: t("private"), description: t("onlyYouAccess") },
              { value: "PUBLIC", label: t("publicAccess"), description: t("anyoneWithLink") },
            ] as const).map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={async () => {
                  onVisibilityChange(option.value);
                  await onSaveShare(option.value);
                }}
                className={cn(
                  "group w-full rounded-lg border px-3 py-3 text-left transition-colors",
                  shareVisibility === option.value
                    ? "border-primary/45 bg-primary/10"
                    : "border-border/70 bg-muted/15 hover:bg-accent/35"
                )}
              >
                <div className="flex items-center gap-3.5">
                  <div
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-md transition-colors",
                      shareVisibility === option.value
                        ? "bg-primary/15 text-primary"
                        : "bg-muted/40 text-muted-foreground"
                    )}
                  >
                    {option.value === "PRIVATE" ? (
                      <Lock className="h-4.5 w-4.5" />
                    ) : (
                      <Globe className="h-4.5 w-4.5" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold">{option.label}</span>
                      <span className="ml-auto inline-flex h-4.5 w-4.5 items-center justify-center rounded-full border border-muted-foreground/25">
                        {shareVisibility === option.value ? (
                          <CheckCircle2 className="h-4.5 w-4.5 text-emerald-500" />
                        ) : null}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{option.description}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>

          <div className="space-y-2 pt-1">
            <button
              onClick={() => void onCopyShareLink()}
              disabled={shareVisibility !== "PUBLIC"}
              className={cn(
                "inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border/70 px-3 py-2.5 text-sm font-medium transition-colors",
                shareVisibility === "PUBLIC"
                  ? "cursor-pointer bg-foreground text-background hover:bg-foreground/90"
                  : "cursor-not-allowed bg-muted text-muted-foreground"
              )}
            >
              {shareCopyMessage ? (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  <span>{shareCopyMessage}</span>
                </>
              ) : (
                <>
                  <span>{t("copyLink")}</span>
                  <Link className="h-4 w-4" />
                </>
              )}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
