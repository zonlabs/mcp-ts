"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ChevronRight,
  Settings,
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

export const PlaygroundSidebar = () => {
  const [isOpen, setIsOpen] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [chats, setChats] = useState<{ id: string; title: string | null; updated_at: string | null; created_at: string | null; visibility?: string | null }[]>([]);
  const [isLoadingChats, setIsLoadingChats] = useState(false);
  const [chatQuery, setChatQuery] = useState("");
  const [activeChatMenuId, setActiveChatMenuId] = useState<string | null>(null);
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [shareChatId, setShareChatId] = useState<string | null>(null);
  const [shareVisibility, setShareVisibility] = useState<'PRIVATE' | 'PUBLIC'>('PRIVATE');
  const [isSavingShare, setIsSavingShare] = useState(false);
  const [shareCopyMessage, setShareCopyMessage] = useState<string | null>(null);
  const { userSession } = useAuth();
  const { t } = useI18n();
  const user = userSession?.user;
  const router = useRouter();
  const pathname = usePathname();

  const settingsLinks = [
    { label: t("account"), href: "/settings", icon: User },
    { label: t("preferences"), href: "/settings/preferences", icon: SlidersHorizontal },
    { label: t("apiKeys"), href: "/settings/api-keys", icon: KeyRound },
    { label: t("connectors"), href: "/settings/connectors", icon: Plug },
  ];

  const userName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Guest';
  const userImage = user?.user_metadata?.avatar_url;


  const navigateTo = (path: string) => {
    router.push(path);
    setIsMobileMenuOpen(false);
  };

  useEffect(() => {
    if (!user?.id) {
      setChats([]);
      return;
    }
    let isActive = true;
    setIsLoadingChats(true);
    const supabase = createClient();
    (async () => {
      try {
        const { data, error } = await supabase
          .from("chats")
          .select("id, title, updated_at, created_at, visibility")
          .eq("user_id", user.id)
          .order("updated_at", { ascending: false });
        if (!isActive) return;
        if (error) {
          console.error("[PlaygroundSidebar] failed to load chats:", error);
          setChats([]);
          return;
        }
        setChats(Array.isArray(data) ? data : []);
      } finally {
        if (isActive) setIsLoadingChats(false);
      }
    })();
    return () => {
      isActive = false;
    };
  }, [user?.id]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ chatId: string; title: string }>).detail;
      if (!detail?.chatId || !detail?.title) return;
      setChats((prev) =>
        prev.map((chat) =>
          chat.id === detail.chatId
            ? { ...chat, title: detail.title }
            : chat
        )
      );
    };
    window.addEventListener('chat:title', handler as EventListener);
    return () => window.removeEventListener('chat:title', handler as EventListener);
  }, []);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ chatId: string }>).detail;
      if (!detail?.chatId) return;
      setChats((prev) => [
        { id: detail.chatId, title: "New Chat", updated_at: new Date().toISOString(), created_at: new Date().toISOString() },
        ...prev,
      ]);
    };
    window.addEventListener('chat:created', handler as EventListener);
    return () => window.removeEventListener('chat:created', handler as EventListener);
  }, []);

  const filteredChats = useMemo(() => {
    const query = chatQuery.trim().toLowerCase();
    if (!query) return chats;
    return chats.filter((chat) => (chat.title || "").toLowerCase().includes(query));
  }, [chats, chatQuery]);

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

    setChats((prev) => prev.map((c) => (c.id === chatId ? { ...c, title: trimmed } : c)));
    const supabase = createClient();
    const { error } = await supabase
      .from("chats")
      .update({ title: trimmed, updated_at: new Date().toISOString() })
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
    const { error } = await supabase
      .from("chats")
      .delete()
      .eq("id", chatId);
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
    const nextVisibility = (chat?.visibility || 'PRIVATE') as 'PRIVATE' | 'PUBLIC';
    setShareChatId(chatId);
    setShareVisibility(nextVisibility);
    setIsShareOpen(true);
  };

  const handleOpenChatInNewTab = (chatId: string) => {
    window.open(`/chat/${chatId}`, "_blank", "noopener,noreferrer");
  };

  const handleSaveShare = async (nextVisibility?: 'PRIVATE' | 'PUBLIC') => {
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
    setChats((prev) => prev.map((c) => (c.id === shareChatId ? { ...c, visibility: targetVisibility } : c)));
    setIsSavingShare(false);
    toast.success(t("shareSettingsUpdated"));
  };

  const handleCopyShareLink = async () => {
    if (!shareChatId) return;
    if (shareVisibility !== 'PUBLIC') {
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

  const renderSettingsLinks = (onNavigate: (path: string) => void, itemClassName: string) => (
    <>
      {settingsLinks.map((link) => {
        const Icon = link.icon;
        return (
          <button
            key={link.href}
            onClick={() => onNavigate(link.href)}
            className={cn(
              itemClassName,
              pathname === link.href
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
            )}
          >
            <Icon className="w-4 h-4" />
            <span>{link.label}</span>
          </button>
        );
      })}
    </>
  );

  const renderChatItems = (onNavigate: (path: string) => void) => (
    <>
      {isLoadingChats && (
        <div className="px-2 py-2 text-xs text-muted-foreground">{t("loadingChats")}</div>
      )}
      {!isLoadingChats && filteredChats.length === 0 && (
        <div className="px-2 py-2 text-xs text-muted-foreground">{t("noChatsYet")}</div>
      )}
      {filteredChats.map((chat) => (
        <div
          key={chat.id}
          className={cn(
            "group flex items-center gap-2 rounded-md px-2.5 py-2 text-sm transition-colors",
            pathname === `/chat/${chat.id}`
              ? "bg-accent text-foreground"
              : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
          )}
        >
          <div className="flex-1 min-w-0">
            {editingChatId === chat.id ? (
              <input
                value={editingTitle}
                onChange={(e) => setEditingTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleSaveRenameChat(chat.id);
                  }
                  if (e.key === "Escape") {
                    e.preventDefault();
                    handleCancelRenameChat();
                  }
                }}
                onBlur={() => handleSaveRenameChat(chat.id)}
                autoFocus
                className="w-full bg-transparent border border-border/60 rounded-md px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            ) : (
              <button
                onClick={() => onNavigate(`/chat/${chat.id}`)}
                className="w-full text-left"
              >
                <span className="block truncate text-[15px]">{formatChatTitle(chat.title)}</span>
              </button>
            )}
          </div>
          <DropdownMenu onOpenChange={(open) => setActiveChatMenuId(open ? chat.id : null)}>
            <DropdownMenuTrigger asChild>
              <button
                className={cn(
                  "h-6 w-6 rounded-md flex items-center justify-center hover:bg-accent/70",
                  activeChatMenuId === chat.id ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                )}
                aria-label={t("chatActions")}
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 rounded-xl border border-border/70 bg-background/95 p-2 shadow-xl">
              <DropdownMenuItem onClick={() => handleRenameChat(chat.id)} className="gap-2 rounded-md px-2 py-2 text-sm">
                <SquarePen className="h-4 w-4" />
                {t("rename")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleOpenChatInNewTab(chat.id)} className="gap-2 rounded-md px-2 py-2 text-sm">
                <ExternalLink className="h-4 w-4" />
                {t("openInNewTab")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleOpenShare(chat.id)} className="gap-2 rounded-md px-2 py-2 text-sm">
                <ArrowUpRight className="h-4 w-4" />
                {t("share")}
              </DropdownMenuItem>
              <DropdownMenuSeparator className="my-1" />
              <DropdownMenuItem
                onClick={() => handleDeleteChat(chat.id)}
                className="gap-2 rounded-md px-2 py-2 text-sm text-destructive focus:text-destructive"
              >
                <X className="h-4 w-4" />
                {t("delete")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ))}
    </>
  );

  const renderChatSearch = (
    wrapperClassName: string,
    labelClassName: string,
    labelText: string
  ) => (
    <div className={wrapperClassName}>
      <div className={cn("flex items-center gap-2 text-[11px] font-instrument-serif uppercase tracking-[0.16em] text-muted-foreground/80", labelClassName)}>
        <span>{labelText}</span>
      </div>
      <div className="mt-2 relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
        <input
          value={chatQuery}
          onChange={(e) => setChatQuery(e.target.value)}
          placeholder={t("searchChats")}
          className="w-full rounded-md border border-border/60 bg-background/60 pl-9 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile Top Bar */}
      <div className="md:hidden h-14 border-b border-border/60 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/70 px-3 flex items-center justify-between">
        <button
          onClick={() => setIsMobileMenuOpen(true)}
          className="h-9 w-9 rounded-md flex items-center justify-center hover:bg-accent transition-colors"
          aria-label={t("openNavigationMenu")}
        >
          <PanelLeftOpen className="w-5 h-5 text-foreground" />
        </button>
        <button
          onClick={() => router.push("/chat")}
          className="text-sm font-medium text-foreground"
        >
          {activeChatTitle}
        </button>
        <button
          onClick={() => router.push("/chat")}
          className="h-9 w-9 rounded-md flex items-center justify-center hover:bg-accent transition-colors"
          aria-label={t("newChat")}
        >
          <SquarePen className="w-5 h-5 text-foreground" />
        </button>
      </div>

      {/* Mobile Drawer */}
      <Dialog open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
        <DialogContent className="md:hidden p-0 rounded-none max-w-[85vw] w-72 h-full left-0 top-0 translate-x-0 translate-y-0 border-y-0 border-l-0 border-r border-border/60" showCloseButton={false}>
          <div className="h-full flex flex-col bg-background">
            <div className="h-14 border-b border-border/60 px-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Image
                  src="/logo-mark-red.svg"
                  alt="MCP Assistant"
                  width={20}
                  height={20}
                  className="opacity-90"
                />
                <span className="text-sm font-medium font-sans-original">MCP Assistant</span>
              </div>
              <button
                onClick={() => setIsMobileMenuOpen(false)}
                className="h-9 w-9 rounded-md flex items-center justify-center hover:bg-accent transition-colors"
                aria-label={t("closeNavigationMenu")}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-3 py-4 space-y-2">
              <button
                onClick={() => navigateTo('/mcp')}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors",
                  pathname === "/mcp"
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                )}
              >
                <LayoutGrid className="w-5 h-5" />
                <span className="font-instrument-serif text-[16px] tracking-wide">{t("apps")}</span>
              </button>
              <button
                onClick={() => navigateTo('/chat')}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors",
                  pathname === "/chat"
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                )}
              >
                <SquarePen className="w-5 h-5" />
                  <span className="font-instrument-serif text-[16px] tracking-wide">{t("newChat")}</span>
              </button>
              <button
                onClick={() => setIsSettingsOpen((prev) => !prev)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors",
                  pathname.startsWith("/settings")
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                )}
                aria-expanded={isSettingsOpen}
              >
                <Settings className="w-5 h-5" />
                <span className="flex-1 text-left">{t("settings")}</span>
                <ChevronRight className={cn("w-4 h-4 transition-transform", isSettingsOpen ? "rotate-90" : "")} />
              </button>
              {isSettingsOpen && (
                <div className="pl-4 pr-1 space-y-1">
                  {renderSettingsLinks(navigateTo, "w-full flex items-center gap-2 rounded-md pl-4 pr-2 py-2 text-sm transition-colors")}
                </div>
              )}

              <div className="pt-3">
                {renderChatSearch("mt-2", "px-3", t("yourChats"))}
                <div className="mt-2 space-y-1 max-h-[45vh] overflow-y-auto pr-1">
                  {renderChatItems(navigateTo)}
                </div>
              </div>
            </div>

            <div className="mt-auto border-t border-border/60 p-3">
              <div className="flex items-center gap-3">
                {userImage ? (
                  <Image
                    src={userImage}
                    alt={userName}
                    width={34}
                    height={34}
                    className="rounded-full flex-shrink-0"
                  />
                ) : (
                  <div className="w-8.5 h-8.5 bg-orange-500 rounded-full flex items-center justify-center flex-shrink-0 text-white font-semibold text-sm">
                    {userName.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-instrument-serif tracking-wide truncate">{userName}</p>
                  {user?.email && (
                    <p className="text-xs text-muted-foreground truncate">
                      {user.email}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => navigateTo('/settings')}
                  className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors"
                >
                  <User className="w-3.5 h-3.5" />
                  <span>{t("account")}</span>
                </button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Share Dialog */}
      <Dialog open={isShareOpen} onOpenChange={setIsShareOpen}>
        <DialogContent className="w-[calc(100vw-2.5rem)] max-w-sm md:max-w-xs max-h-[85vh] overflow-y-auto bg-background text-foreground p-4 sm:p-5">
          <div className="space-y-4">
            <DialogHeader className="space-y-0">
              <DialogTitle className="text-base font-semibold">{t("shareConversation")}</DialogTitle>
            </DialogHeader>
            <div className="flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-300 px-3 py-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-md">
                <AlertTriangle className="h-4.5 w-4.5" />
              </div>
              <p className="text-xs leading-relaxed">
                {t("shareWarning")}
              </p>
            </div>

            <div className="space-y-2">
              {([
                { value: 'PRIVATE', label: t("private"), description: t("onlyYouAccess") },
                { value: 'PUBLIC', label: t("publicAccess"), description: t("anyoneWithLink") },
              ] as const).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={async () => {
                    setShareVisibility(option.value);
                    await handleSaveShare(option.value);
                  }}
                  className={cn(
                    "w-full text-left rounded-lg px-2 py-1.5 transition-colors border",
                    shareVisibility === option.value
                      ? "border-primary/50 bg-primary/10"
                      : "border-border/70 hover:bg-accent/40"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "h-8 w-8 rounded-md flex items-center justify-center",
                      shareVisibility === option.value
                        ? "bg-primary/10 text-primary"
                        : "bg-muted/40 text-muted-foreground"
                    )}>
                      {option.value === 'PRIVATE' ? (
                        <Lock className="h-5 w-5" />
                      ) : (
                        <Globe className="h-5 w-5" />
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold">{option.label}</span>
                        {shareVisibility === option.value ? (
                          <span className="inline-flex items-center justify-center h-5 w-5 rounded-full border border-emerald-500/70 bg-emerald-500/10 text-emerald-500 text-xs">
                            ✓
                          </span>
                        ) : (
                          <span className="inline-flex h-5 w-5 rounded-full border border-muted-foreground/30" />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{option.description}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between min-h-[22px]">
                <div className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-500">
                  <CheckCircle2 className={shareCopyMessage ? "h-3.5 w-3.5" : "h-3.5 w-3.5 opacity-0"} />
                  <span className={shareCopyMessage ? "" : "opacity-0"}>
                    {shareCopyMessage ?? t("copied")}
                  </span>
                </div>
              </div>
              <button
                onClick={handleCopyShareLink}
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-border/70 bg-white text-zinc-900 px-3 py-2 text-xs transition-colors hover:bg-zinc-100 cursor-pointer dark:bg-white dark:text-zinc-900"
              >
                <span>{t("copyLink")}</span>
                <Link className="h-4 w-4" />
              </button>
            </div>

          </div>
        </DialogContent>
      </Dialog>

      {/* Desktop Sidebar */}
      <div className="relative hidden md:flex">
      <div
        className={cn(
          "transition-all duration-300 ease-in-out flex flex-col bg-background",
          isOpen ? "w-64" : "w-16"
        )}
      >
        {/* Logo Section */}
        <div className={cn(
          "flex items-center pt-3 px-3 pb-3 flex-shrink-0",
          isOpen ? "justify-start" : "justify-center"
        )}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setIsOpen(!isOpen)}
                className={cn(
                  "flex items-center rounded-md hover:bg-accent/50 transition-colors cursor-pointer group",
                  isOpen ? "p-2" : "p-2"
                )}
              >
                {isOpen ? (
                  <PanelLeftClose className="w-6 h-6 text-primary group-hover:text-primary/80 transition-colors" />
                ) : (
                  <PanelLeftOpen className="w-6 h-6 text-primary group-hover:text-primary/80 transition-colors" />
                )}
              </button>
            </TooltipTrigger>
            {!isOpen && (
              <TooltipContent side="right" sideOffset={8}>
                {t("toggleSidebar")}
              </TooltipContent>
            )}
          </Tooltip>
        </div>

        {/* Navigation Buttons */}
        <div className={cn(
          "pb-3 space-y-2 flex-shrink-0",
          isOpen ? "px-2" : "px-1"
        )}>

          {/* Apps Button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => router.push('/mcp')}
                className={cn(
                  "w-full flex items-center py-2 rounded-md text-sm font-medium transition-colors cursor-pointer",
                  isOpen ? "gap-3 px-3" : "justify-center px-0",
                  pathname === "/mcp"
                    ? "text-primary hover:text-primary/80"
                    : "hover:bg-accent/50 text-muted-foreground hover:text-foreground"
                )}
              >
                <LayoutGrid className="w-5 h-5 flex-shrink-0" />
                {isOpen && <span className="truncate text-[16px]">{t("apps")}</span>}
              </button>
            </TooltipTrigger>
            {!isOpen && (
              <TooltipContent side="right" sideOffset={8}>
                {t("apps")}
              </TooltipContent>
            )}
          </Tooltip>

          {/* New Chat Button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => router.push('/chat')}
                className={cn(
                  "w-full flex items-center py-2 rounded-md text-sm font-medium transition-colors cursor-pointer",
                  isOpen ? "gap-3 px-3" : "justify-center px-0",
                  pathname === "/chat"
                    ? "text-primary hover:text-primary/80"
                    : "hover:bg-accent/50 text-muted-foreground hover:text-foreground"
                )}
              >
                <SquarePen className="w-5 h-5 flex-shrink-0" />
                {isOpen && <span className="truncate text-[16px]">{t("newChat")}</span>}
              </button>
            </TooltipTrigger>
            {!isOpen && (
              <TooltipContent side="right" sideOffset={8}>
                {t("newChat")}
              </TooltipContent>
            )}
          </Tooltip>

          {/* Settings Button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => {
                  setIsSettingsOpen((prev) => !prev);
                  if (!isOpen) {
                    setIsOpen(true);
                  }
                }}
                className={cn(
                  "w-full flex items-center py-2 rounded-md text-sm font-medium transition-colors cursor-pointer",
                  isOpen ? "gap-3 px-3" : "justify-center px-0",
                  pathname.startsWith("/settings")
                    ? "text-primary hover:text-primary/80"
                    : "hover:bg-accent/50 text-muted-foreground hover:text-foreground"
                )}
              >
                <Settings className="w-5 h-5 flex-shrink-0" />
                {isOpen && (
                  <>
                    <span className="truncate flex-1 text-left text-[16px]">{t("settings")}</span>
                    <ChevronRight className={cn("w-4 h-4 transition-transform", isSettingsOpen ? "rotate-90" : "")} />
                  </>
                )}
              </button>
            </TooltipTrigger>
            {!isOpen && (
              <TooltipContent side="right" sideOffset={8}>
                {t("settings")}
              </TooltipContent>
            )}
          </Tooltip>
        </div>

        {/* Chats List */}
        <div className="flex-1 min-h-0 flex flex-col">
          {isOpen && isSettingsOpen && (
            <div className="px-2 pb-2 space-y-1">
              {renderSettingsLinks(router.push, "w-full flex items-center gap-2 rounded-md pl-5 pr-2 py-2 text-sm transition-colors")}
            </div>
          )}
          {isOpen && (
            <div className="px-3 pb-3">
              {renderChatSearch("", "", t("yourChats"))}
            </div>
          )}
          {isOpen && (
            <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-2 space-y-1">
              {isLoadingChats && (
                <div className="px-2 py-2 text-xs text-muted-foreground">{t("loadingChats")}</div>
              )}
              {!isLoadingChats && filteredChats.length === 0 && (
                <div className="px-2 py-2 text-xs text-muted-foreground">{t("noChatsYet")}</div>
              )}
              {filteredChats.map((chat) => (
                <div
                  key={chat.id}
                  className={cn(
                    "group flex items-center gap-2 rounded-md px-2.5 py-2 text-sm transition-colors",
                    pathname === `/chat/${chat.id}`
                      ? "bg-accent text-foreground"
                      : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                  )}
                >
                  <div className="flex-1 min-w-0">
                    {editingChatId === chat.id ? (
                      <input
                        value={editingTitle}
                        onChange={(e) => setEditingTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleSaveRenameChat(chat.id);
                          }
                          if (e.key === "Escape") {
                            e.preventDefault();
                            handleCancelRenameChat();
                          }
                        }}
                        onBlur={() => handleSaveRenameChat(chat.id)}
                        autoFocus
                        className="w-full bg-transparent border border-border/60 rounded-md px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                      />
                    ) : (
                      <button
                        onClick={() => router.push(`/chat/${chat.id}`)}
                        className="w-full text-left"
                      >
                        <span className="block truncate text-[15px]">{formatChatTitle(chat.title)}</span>
                      </button>
                    )}
                  </div>
                  <DropdownMenu onOpenChange={(open) => setActiveChatMenuId(open ? chat.id : null)}>
                    <DropdownMenuTrigger asChild>
                      <button
                        className={cn(
                          "h-6 w-6 rounded-md flex items-center justify-center hover:bg-accent/70",
                          activeChatMenuId === chat.id ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                        )}
                        aria-label={t("chatActions")}
                      >
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48 rounded-xl border border-border/70 bg-background/95 p-2 shadow-xl">
                      <DropdownMenuItem onClick={() => handleRenameChat(chat.id)} className="gap-2 rounded-md px-2 py-2 text-sm">
                        <SquarePen className="h-4 w-4" />
                        {t("rename")}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleOpenChatInNewTab(chat.id)} className="gap-2 rounded-md px-2 py-2 text-sm">
                        <ExternalLink className="h-4 w-4" />
                        {t("openInNewTab")}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleOpenShare(chat.id)} className="gap-2 rounded-md px-2 py-2 text-sm">
                        <ArrowUpRight className="h-4 w-4" />
                        {t("share")}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator className="my-1" />
                      <DropdownMenuItem
                        onClick={() => handleDeleteChat(chat.id)}
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
          )}
        </div>


        {/* Profile Action at Bottom */}
        <div className={cn("p-3 flex-shrink-0")}>
          {!isOpen ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => router.push('/settings')}
                  className="w-full flex items-center justify-center p-2 rounded-md transition-colors cursor-pointer hover:bg-accent"
                >
                  {userImage ? (
                    <Image
                      src={userImage}
                      alt={userName}
                      width={32}
                      height={32}
                      className="rounded-full flex-shrink-0"
                    />
                  ) : (
                    <div className="w-8 h-8 bg-orange-500 rounded-full flex items-center justify-center flex-shrink-0 text-white font-semibold text-sm">
                      {userName.charAt(0).toUpperCase()}
                    </div>
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={8}>
                {t("account")} {t("settings")}
              </TooltipContent>
            </Tooltip>
          ) : (
            <button
              onClick={() => router.push('/settings')}
              className="w-full flex items-center gap-3 p-2 rounded-md transition-colors cursor-pointer hover:bg-accent"
            >
              {userImage ? (
                <Image
                  src={userImage}
                  alt={userName}
                  width={40}
                  height={40}
                  className="rounded-full flex-shrink-0"
                />
              ) : (
                <div className="w-10 h-10 bg-orange-500 rounded-full flex items-center justify-center flex-shrink-0 text-white font-semibold">
                  {userName.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="flex flex-col items-start overflow-hidden flex-1">
                <span className="text-sm font-medium truncate w-full">{userName}</span>
                {user?.email && (
                  <span className="text-xs text-muted-foreground truncate w-full">
                    {user.email}
                  </span>
                )}
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            </button>
          )}
        </div>
      </div>
      </div>
    </>
  );
};
