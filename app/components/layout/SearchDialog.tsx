"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Home,
  LayoutGrid,
  Folder,
  MessageSquare,
  KeyRound,
  SlidersHorizontal,
  Brain,
  Database,
  FileText,
  ArrowRight,
  Pin,
  Clock,
  Wrench,
  ExternalLink,
  Copy,
  Check,
  X,
  Server,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { SidebarChat } from "@/lib/sidebar-chats";
import { useSidebarProjects } from "@/lib/hooks/use-projects";
import { useMcpContext } from "@/components/providers/McpProvider";

interface SearchDialogProps {
  open: boolean;
  onClose: () => void;
  chats?: SidebarChat[];
}

type FilterCategory = "all" | "chats" | "projects" | "tools" | "pages";

interface PageItem {
  type: "page";
  id: string;
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  category: "Navigation" | "Settings" | "Docs";
  external?: boolean;
}

interface ChatItem {
  type: "chat";
  id: string;
  label: string;
  href: string;
  chat: SidebarChat;
}

interface ProjectItem {
  type: "project";
  id: string;
  label: string;
  href: string;
  project: {
    id: string;
    name: string;
    custom_instructions?: string | null;
    memory_scope?: string | null;
    created_at?: string | null;
  };
}

interface ToolItem {
  type: "tool";
  id: string;
  label: string;
  href: string;
  serverName: string;
  serverId?: string;
  serverUrl?: string;
  description?: string;
}

type SearchItem = PageItem | ChatItem | ProjectItem | ToolItem;

const PAGES: PageItem[] = [
  { type: "page", id: "page-home", label: "Home", href: "/mcp?tab=home", icon: Home, description: "Activity overview, tool stats, and telemetry", category: "Navigation" },
  { type: "page", id: "page-apps", label: "Apps & Connectors", href: "/mcp?tab=apps", icon: LayoutGrid, description: "Connect, browse, and manage MCP servers", category: "Navigation" },
  { type: "page", id: "page-projects", label: "Projects", href: "/projects", icon: Folder, description: "Workspaces with custom instructions and memory", category: "Navigation" },
  { type: "page", id: "page-chat", label: "Playground Chat", href: "/chat", icon: MessageSquare, description: "Chat with AI and run tools in real-time", category: "Navigation" },
  { type: "page", id: "page-api-keys", label: "API Keys", href: "/settings/api-keys", icon: KeyRound, description: "Manage LLM and third-party API credentials", category: "Settings" },
  { type: "page", id: "page-data-controls", label: "Data Controls", href: "/settings/data-controls", icon: Database, description: "Manage chat privacy, export data, and shared links", category: "Settings" },
  { type: "page", id: "page-settings", label: "Preferences", href: "/settings/preferences", icon: SlidersHorizontal, description: "Global user preferences and model defaults", category: "Settings" },
  { type: "page", id: "page-memories", label: "Memories", href: "/settings/memories", icon: Brain, description: "Manage persistent long-term AI memory facts", category: "Settings" },
  { type: "page", id: "page-docs", label: "Documentation", href: "https://docs.linkos.in/", icon: FileText, description: "LinkOS guides, SDKs, and API reference", category: "Docs", external: true },
];

export function SearchDialog({ open, onClose, chats = [] }: SearchDialogProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<FilterCategory>("all");
  const [activeIdx, setActiveIdx] = useState(0);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Load user projects
  const { projects = [] } = useSidebarProjects({ enabled: open });

  // Load connected MCP tools
  const { connections = [] } = useMcpContext();

  // Reset state when opening
  useEffect(() => {
    if (open) {
      setQuery("");
      setCategory("all");
      setActiveIdx(0);
      setCopied(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Extract all available MCP tools across active connections
  const mcpToolItems: ToolItem[] = useMemo(() => {
    const list: ToolItem[] = [];
    for (const conn of connections) {
      const serverName = conn.serverName || "MCP Server";
      const tools = (conn.tools as Array<{ name: string; description?: string }>) || [];
      for (const t of tools) {
        list.push({
          type: "tool",
          id: `tool-${conn.sessionId}-${t.name}`,
          label: t.name,
          href: `/mcp?tab=apps`,
          serverName,
          serverId: conn.serverId,
          serverUrl: conn.serverUrl,
          description: t.description,
        });
      }
    }
    return list;
  }, [connections]);

  // Filtered pages
  const filteredPages = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return PAGES;
    return PAGES.filter(
      (p) =>
        p.label.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q)
    );
  }, [query]);

  // Filtered projects
  const filteredProjects = useMemo<ProjectItem[]>(() => {
    const q = query.trim().toLowerCase();
    const mapped = projects.map((p) => ({
      type: "project" as const,
      id: p.id,
      label: p.name || "Untitled Project",
      href: `/projects/${p.id}`,
      project: {
        id: p.id,
        name: p.name,
        custom_instructions: p.custom_instructions,
        memory_scope: p.memory_scope,
        created_at: p.created_at,
      },
    }));

    if (!q) return mapped;
    return mapped.filter(
      (p) =>
        p.label.toLowerCase().includes(q) ||
        (p.project.custom_instructions || "").toLowerCase().includes(q)
    );
  }, [query, projects]);

  // Filtered chats (pinned first, then recent)
  const filteredChats = useMemo<ChatItem[]>(() => {
    const q = query.trim().toLowerCase();
    const sorted = [...chats].sort((a, b) => {
      if (a.is_pinned && !b.is_pinned) return -1;
      if (!a.is_pinned && b.is_pinned) return 1;
      return (
        (Date.parse(b.updated_at || b.created_at || "") || 0) -
        (Date.parse(a.updated_at || a.created_at || "") || 0)
      );
    });

    const mapped = sorted.map((c) => ({
      type: "chat" as const,
      id: c.id,
      label: c.title || "New Chat",
      href: c.project_id ? `/projects/${c.project_id}/chat/${c.id}` : `/chat/${c.id}`,
      chat: c,
    }));

    if (!q) return mapped.slice(0, 12);
    return mapped.filter((c) => c.label.toLowerCase().includes(q)).slice(0, 20);
  }, [query, chats]);

  // Filtered tools
  const filteredTools = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return mcpToolItems.slice(0, 10);
    return mcpToolItems.filter(
      (t) =>
        t.label.toLowerCase().includes(q) ||
        t.serverName.toLowerCase().includes(q) ||
        (t.description || "").toLowerCase().includes(q)
    ).slice(0, 15);
  }, [query, mcpToolItems]);

  // Combined visible items according to active category tab
  const visibleItems = useMemo<SearchItem[]>(() => {
    switch (category) {
      case "chats":
        return filteredChats;
      case "projects":
        return filteredProjects;
      case "tools":
        return filteredTools;
      case "pages":
        return filteredPages;
      case "all":
      default:
        return [
          ...filteredPages,
          ...filteredProjects,
          ...filteredChats,
          ...filteredTools,
        ];
    }
  }, [category, filteredPages, filteredProjects, filteredChats, filteredTools]);

  const totalItems = visibleItems.length;
  const activeItem = visibleItems[activeIdx] ?? visibleItems[0] ?? null;

  // Keep index within bounds
  useEffect(() => {
    setActiveIdx((curr) => Math.min(curr, Math.max(0, totalItems - 1)));
  }, [totalItems]);

  // Scroll active item into view
  useEffect(() => {
    if (!listRef.current) return;
    const activeElem = listRef.current.querySelector(`[data-index="${activeIdx}"]`);
    if (activeElem) {
      activeElem.scrollIntoView({ block: "nearest" });
    }
  }, [activeIdx]);

  const navigateTo = useCallback(
    (href: string, external?: boolean) => {
      if (external) {
        window.open(href, "_blank", "noopener,noreferrer");
      } else {
        router.push(href);
      }
      onClose();
    },
    [router, onClose]
  );

  const handleCopyLink = useCallback(
    (href: string) => {
      const fullUrl = href.startsWith("http")
        ? href
        : `${typeof window !== "undefined" ? window.location.origin : ""}${href}`;
      void navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    },
    []
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIdx((i) => Math.min(i + 1, Math.max(0, totalItems - 1)));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === "Tab") {
        e.preventDefault();
        const categories: FilterCategory[] = ["all", "chats", "projects", "tools", "pages"];
        const curIdx = categories.indexOf(category);
        const nextIdx = e.shiftKey
          ? (curIdx - 1 + categories.length) % categories.length
          : (curIdx + 1) % categories.length;
        setCategory(categories[nextIdx]);
        setActiveIdx(0);
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (activeItem) {
          navigateTo(activeItem.href, "external" in activeItem ? activeItem.external : false);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    },
    [activeIdx, totalItems, category, activeItem, navigateTo, onClose]
  );

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm transition-opacity animate-in fade-in duration-150"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Two-Pane Raycast/Linear Command Palette Modal */}
      <div
        className="fixed left-1/2 top-[12%] sm:top-[14%] z-50 -translate-x-1/2 w-full max-w-4xl px-3 sm:px-4"
        role="dialog"
        aria-modal="true"
        aria-label="Global Command Palette"
      >
        <div className="bg-card border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col h-[560px] max-h-[85vh] animate-in fade-in zoom-in-95 duration-150">
          {/* 1. Header Search Input */}
          <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border bg-card shrink-0">
            <Search className="size-4.5 text-muted-foreground shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActiveIdx(0);
              }}
              onKeyDown={handleKeyDown}
              placeholder="Search chats, projects, tools, or pages..."
              className="flex-1 bg-transparent text-sm sm:text-base font-sans text-foreground placeholder:text-muted-foreground outline-none"
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setActiveIdx(0);
                  inputRef.current?.focus();
                }}
                className="p-1 rounded-sm text-muted-foreground hover:text-foreground transition-colors"
                title="Clear query"
              >
                <X className="size-3.5" />
              </button>
            )}
            <kbd className="hidden sm:inline-flex h-5 items-center gap-0.5 rounded border border-border bg-background px-1.5 font-mono text-[10px] text-muted-foreground select-none">
              ESC
            </kbd>
          </div>

          {/* 2. Filter Category Pills Bar */}
          <div className="flex items-center gap-1.5 px-4 py-2 border-b border-border/70 bg-muted/20 overflow-x-auto scrollbar-minimal shrink-0">
            {[
              { id: "all", label: "All", count: totalItems },
              { id: "chats", label: "Chats", count: filteredChats.length },
              { id: "projects", label: "Projects", count: filteredProjects.length },
              { id: "tools", label: "Tools", count: filteredTools.length },
              { id: "pages", label: "Navigation", count: filteredPages.length },
            ].map((tab) => {
              const isSelected = category === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setCategory(tab.id as FilterCategory);
                    setActiveIdx(0);
                  }}
                  className={cn(
                    "px-2.5 py-1 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 select-none shrink-0",
                    isSelected
                      ? "bg-foreground text-background shadow-xs"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  )}
                >
                  <span>{tab.label}</span>
                  {tab.count > 0 && (
                    <span
                      className={cn(
                        "text-[10px] font-mono px-1 py-0.2 rounded-xs",
                        isSelected
                          ? "bg-background/20 text-background font-semibold"
                          : "text-muted-foreground/70"
                      )}
                    >
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* 3. Main Body: Split into Left Result List + Right Live Preview Inspector */}
          <div className="flex-1 flex min-h-0 overflow-hidden bg-background">
            {/* Left Result List */}
            <div
              ref={listRef}
              className="flex-1 overflow-y-auto scrollbar-minimal py-2 px-2 divide-y divide-border/20"
            >
              {totalItems === 0 ? (
                <div className="flex flex-col items-center justify-center h-full py-16 text-center text-muted-foreground">
                  <Search className="size-8 stroke-[1.5] mb-2 opacity-40" />
                  <p className="text-sm font-medium text-foreground">No matches found</p>
                  <p className="text-xs text-muted-foreground font-mono mt-1">
                    Try adjusting your search terms or filter tab
                  </p>
                </div>
              ) : (
                <div className="space-y-0.5">
                  {visibleItems.map((item, idx) => {
                    const isActive = idx === activeIdx;

                    return (
                      <button
                        key={item.id}
                        data-index={idx}
                        onClick={() =>
                          navigateTo(item.href, "external" in item ? item.external : false)
                        }
                        onMouseEnter={() => setActiveIdx(idx)}
                        className={cn(
                          "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all group",
                          isActive
                            ? "bg-accent text-accent-foreground shadow-2xs"
                            : "hover:bg-muted/40 text-foreground"
                        )}
                      >
                        {/* Leading Icon */}
                        <div
                          className={cn(
                            "size-8 flex items-center justify-center rounded-md border shrink-0 transition-colors",
                            isActive
                              ? "border-border bg-background text-foreground shadow-2xs"
                              : "border-border/50 bg-muted/30 text-muted-foreground group-hover:text-foreground"
                          )}
                        >
                          {item.type === "page" && <item.icon className="size-4" />}
                          {item.type === "chat" && (
                            item.chat.is_pinned ? (
                              <Pin className="size-3.5 text-foreground" />
                            ) : (
                              <MessageSquare className="size-4" />
                            )
                          )}
                          {item.type === "project" && <Folder className="size-4" />}
                          {item.type === "tool" && <Wrench className="size-4" />}
                        </div>

                        {/* Title & Subtitle */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[13px] font-medium truncate">{item.label}</span>
                            {item.type === "chat" && item.chat.is_pinned && (
                              <span className="text-[10px] font-mono px-1 py-0.2 rounded-xs bg-muted text-muted-foreground border border-border/50">
                                Pinned
                              </span>
                            )}
                            {item.type === "tool" && (
                              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-xs bg-muted text-muted-foreground border border-border/50 truncate max-w-[110px]">
                                {item.serverName}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2 text-[11px] text-muted-foreground truncate mt-0.5">
                            {item.type === "page" && <span>{item.description}</span>}
                            {item.type === "project" && (
                              <span>
                                {item.project.custom_instructions
                                  ? item.project.custom_instructions.slice(0, 60) + "..."
                                  : "Workspace environment"}
                              </span>
                            )}
                            {item.type === "chat" && (
                              <>
                                {item.chat.project_id && (
                                  <span className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground/80">
                                    <Folder className="size-2.5" />
                                    project
                                  </span>
                                )}
                                {(item.chat.updated_at || item.chat.created_at) && (
                                  <span className="flex items-center gap-1 font-mono text-[10px]">
                                    <Clock className="size-2.5" />
                                    {new Date(
                                      item.chat.updated_at || item.chat.created_at || ""
                                    ).toLocaleDateString("en-US", {
                                      month: "short",
                                      day: "numeric",
                                    })}
                                  </span>
                                )}
                              </>
                            )}
                            {item.type === "tool" && (
                              <span>{item.description || "MCP Callable Tool"}</span>
                            )}
                          </div>
                        </div>

                        {/* Trailing Action Icon */}
                        {isActive && (
                          <div className="shrink-0 flex items-center text-muted-foreground">
                            <ArrowRight className="size-3.5" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Right Live Preview Inspector Pane (Clean, professional, no redundant borders) */}
            <div className="hidden md:flex flex-col w-[320px] lg:w-[350px] border-l border-border bg-card p-5 overflow-y-auto scrollbar-minimal justify-between shrink-0">
              {activeItem ? (
                <div className="space-y-4 min-w-0">
                  {/* Category Chip & ID */}
                  <div className="flex items-center justify-between gap-2 border-b border-border/50 pb-3">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-medium uppercase tracking-wider bg-muted text-foreground">
                      {activeItem.type === "chat" && <MessageSquare className="size-3 text-muted-foreground" />}
                      {activeItem.type === "project" && <Folder className="size-3 text-muted-foreground" />}
                      {activeItem.type === "tool" && <Wrench className="size-3 text-muted-foreground" />}
                      {activeItem.type === "page" && <Sparkles className="size-3 text-muted-foreground" />}
                      {activeItem.type}
                    </span>
                    <span className="text-[10px] font-mono text-muted-foreground/60 truncate max-w-[140px]">
                      {activeItem.id}
                    </span>
                  </div>

                  {/* Header Title */}
                  <div className="space-y-1">
                    <h3 className="text-base font-semibold text-foreground tracking-tight break-words">
                      {activeItem.label}
                    </h3>
                    {"description" in activeItem && activeItem.description && (
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {activeItem.description}
                      </p>
                    )}
                  </div>

                  {/* Context Information - Clean, Simple layout without redundant borders */}
                  {activeItem.type === "chat" && (
                    <div className="rounded-md bg-muted/30 p-3 space-y-2 text-xs">
                      <div className="flex justify-between items-center text-muted-foreground">
                        <span>Updated</span>
                        <span className="font-mono text-foreground">
                          {new Date(
                            activeItem.chat.updated_at || activeItem.chat.created_at || ""
                          ).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                      {activeItem.chat.project_id && (
                        <div className="flex justify-between items-center text-muted-foreground pt-1.5 border-t border-border/40">
                          <span>Workspace</span>
                          <span className="font-mono text-foreground font-medium">Project Chat</span>
                        </div>
                      )}
                      <div className="flex justify-between items-center text-muted-foreground pt-1.5 border-t border-border/40">
                        <span>Status</span>
                        <span className="font-mono text-foreground">
                          {activeItem.chat.is_pinned ? "Pinned Conversation" : "Active"}
                        </span>
                      </div>
                    </div>
                  )}

                  {activeItem.type === "project" && (
                    <div className="space-y-2.5">
                      {activeItem.project.custom_instructions ? (
                        <div className="rounded-md bg-muted/30 p-3 space-y-1.5">
                          <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground font-semibold">
                            Instructions
                          </span>
                          <p className="text-xs text-foreground/90 italic line-clamp-4 leading-relaxed">
                            &quot;{activeItem.project.custom_instructions}&quot;
                          </p>
                        </div>
                      ) : (
                        <div className="rounded-md bg-muted/20 p-3 text-xs text-muted-foreground font-mono">
                          No custom instructions set
                        </div>
                      )}

                      <div className="rounded-md bg-muted/30 p-3 space-y-1.5 text-xs">
                        <div className="flex justify-between items-center text-muted-foreground">
                          <span>Memory Scope</span>
                          <span className="font-mono text-foreground capitalize">
                            {activeItem.project.memory_scope || "Global"}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeItem.type === "tool" && (
                    <div className="rounded-md bg-muted/30 p-3 space-y-2 text-xs">
                      <div className="flex justify-between items-center text-muted-foreground">
                        <span>Server</span>
                        <span className="font-mono text-foreground font-medium">
                          {activeItem.serverName}
                        </span>
                      </div>
                      {activeItem.serverUrl && (
                        <div className="flex justify-between items-center text-muted-foreground pt-1.5 border-t border-border/40">
                          <span>Endpoint</span>
                          <span className="font-mono text-muted-foreground/80 truncate max-w-[150px]">
                            {activeItem.serverUrl}
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between items-center text-muted-foreground pt-1.5 border-t border-border/40">
                        <span>Capability</span>
                        <span className="font-mono text-foreground">Callable Tool</span>
                      </div>
                    </div>
                  )}

                  {activeItem.type === "page" && (
                    <div className="rounded-md bg-muted/30 p-3 space-y-2 text-xs">
                      <div className="flex justify-between items-center text-muted-foreground">
                        <span>Section</span>
                        <span className="font-mono text-foreground">{activeItem.category}</span>
                      </div>
                      <div className="flex justify-between items-center text-muted-foreground pt-1.5 border-t border-border/40">
                        <span>Destination</span>
                        <span className="font-mono text-foreground truncate max-w-[160px]">
                          {activeItem.href}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground py-10">
                  <Sparkles className="size-5 mb-2 opacity-30" />
                  <p className="text-xs font-mono">Select an item to preview</p>
                </div>
              )}

              {/* Bottom Quick Action Bar in Preview */}
              {activeItem && (
                <div className="pt-3 border-t border-border/50 space-y-2">
                  <button
                    onClick={() =>
                      navigateTo(activeItem.href, "external" in activeItem ? activeItem.external : false)
                    }
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md bg-foreground text-background text-xs font-medium hover:opacity-90 transition-opacity"
                  >
                    <span>Open</span>
                    {"external" in activeItem && activeItem.external ? (
                      <ExternalLink className="size-3.5" />
                    ) : (
                      <kbd className="inline-flex h-4 items-center rounded bg-background/20 px-1 font-mono text-[10px]">
                        ↵
                      </kbd>
                    )}
                  </button>

                  <button
                    onClick={() => handleCopyLink(activeItem.href)}
                    className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md border border-border hover:bg-muted text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {copied ? (
                      <>
                        <Check className="size-3.5 text-foreground" />
                        <span className="text-foreground">Link Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="size-3.5" />
                        <span>Copy Link</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* 4. Footer Legend */}
          <div className="border-t border-border px-4 py-2.5 flex items-center justify-between text-[11px] font-mono text-muted-foreground/75 bg-card shrink-0">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="flex items-center gap-1">
                <kbd className="inline-flex h-4 items-center rounded border border-border bg-background px-1 text-[9px]">
                  ↑↓
                </kbd>
                navigate
              </span>
              <span className="flex items-center gap-1">
                <kbd className="inline-flex h-4 items-center rounded border border-border bg-background px-1 text-[9px]">
                  ↵
                </kbd>
                open
              </span>
              <span className="flex items-center gap-1">
                <kbd className="inline-flex h-4 items-center rounded border border-border bg-background px-1 text-[9px]">
                  Tab
                </kbd>
                filter
              </span>
              <span className="flex items-center gap-1">
                <kbd className="inline-flex h-4 items-center rounded border border-border bg-background px-1 text-[9px]">
                  Esc
                </kbd>
                close
              </span>
            </div>

            <span className="text-[10px] text-muted-foreground/60 select-none hidden sm:inline">
              {totalItems} {totalItems === 1 ? "result" : "results"}
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
