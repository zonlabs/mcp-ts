"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { SidebarChat } from "@/lib/sidebar-chats";

interface SearchDialogProps {
  open: boolean;
  onClose: () => void;
  chats?: SidebarChat[];
}

const PAGES = [
  { label: "Home", href: "/mcp?tab=home", icon: Home, description: "Activity overview and MCP telemetry" },
  { label: "Apps", href: "/mcp?tab=apps", icon: LayoutGrid, description: "Connect and manage MCP servers" },
  { label: "Projects", href: "/projects", icon: Folder, description: "Workspaces with custom instructions, memory, and chats" },
  { label: "Playground", href: "/chat", icon: MessageSquare, description: "Chat with AI and run tools" },
  { label: "API Keys", href: "/settings/api-keys", icon: KeyRound, description: "Manage your API credentials" },
  { label: "Data Controls", href: "/settings/data-controls", icon: Database, description: "Export data, manage shared links, and chat privacy" },
  { label: "Settings", href: "/settings/preferences", icon: SlidersHorizontal, description: "Preferences and configuration" },
  { label: "Memories", href: "/settings/memories", icon: Brain, description: "Manage persistent long-term AI memory" },
  { label: "Documentation", href: "https://docs.linkos.in/", icon: FileText, description: "Guides and API references", external: true },
];

const MAX_CHATS = 8;

export function SearchDialog({ open, onClose, chats = [] }: SearchDialogProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset on open
  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const filteredPages = useMemo(() => {
    if (!query.trim()) return PAGES;
    const q = query.toLowerCase();
    return PAGES.filter(
      (p) => p.label.toLowerCase().includes(q) || p.description.toLowerCase().includes(q)
    );
  }, [query]);

  const filteredChats = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return chats
      .filter((c) => (c.title || "New Chat").toLowerCase().includes(q))
      .sort((a, b) => {
        // pinned first, then by recency
        if (a.is_pinned && !b.is_pinned) return -1;
        if (!a.is_pinned && b.is_pinned) return 1;
        return (Date.parse(b.updated_at || b.created_at || "") || 0) -
               (Date.parse(a.updated_at || a.created_at || "") || 0);
      })
      .slice(0, MAX_CHATS);
  }, [query, chats]);

  // Flat list of all navigable items for keyboard nav
  const allItems = useMemo(() => [
    ...filteredPages.map((p) => ({ type: "page" as const, page: p })),
    ...filteredChats.map((c) => ({ type: "chat" as const, chat: c })),
  ], [filteredPages, filteredChats]);

  const totalItems = allItems.length;

  // Keep activeIdx in bounds when results change
  useEffect(() => {
    setActiveIdx((i) => Math.min(i, Math.max(0, totalItems - 1)));
  }, [totalItems]);

  const navigate = useCallback(
    (href: string, external?: boolean) => {
      if (external) window.open(href, "_blank");
      else router.push(href);
      onClose();
    },
    [router, onClose]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIdx((i) => Math.min(i + 1, Math.max(0, totalItems - 1)));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const item = allItems[activeIdx];
        if (!item) return;
        if (item.type === "page") navigate(item.page.href, item.page.external);
        else navigate(item.chat.project_id ? `/projects/${item.chat.project_id}/chat/${item.chat.id}` : `/chat/${item.chat.id}`);
      } else if (e.key === "Escape") {
        onClose();
      }
    },
    [activeIdx, allItems, navigate, onClose, totalItems]
  );

  if (!open) return null;

  const showEmpty = query.trim() && totalItems === 0;
  const pageOffset = 0;
  const chatOffset = filteredPages.length;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Dialog */}
      <div
        className="fixed left-1/2 top-[18%] z-50 -translate-x-1/2 w-full max-w-[560px] px-4"
        role="dialog"
        aria-modal="true"
        aria-label="Search"
      >
        <div className="bg-card border border-border rounded-md shadow-2xl overflow-hidden">
          {/* Search Input */}
          <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border">
            <Search className="size-4 text-muted-foreground shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => { setQuery(e.target.value); setActiveIdx(0); }}
              onKeyDown={handleKeyDown}
              placeholder="Search chats and pages..."
              className="flex-1 bg-transparent text-sm font-sans text-foreground placeholder:text-muted-foreground outline-none"
            />
            <kbd className="hidden sm:inline-flex h-5 items-center gap-0.5 rounded border border-border bg-background px-1.5 font-mono text-[10px] text-muted-foreground select-none">
              ESC
            </kbd>
          </div>

          {/* Results */}
          <div className="max-h-[420px] overflow-y-auto scrollbar-minimal py-2">

            {/* Pages section */}
            {filteredPages.length > 0 && (
              <div>
                {/* Only show section label when both sections are visible */}
                {filteredChats.length > 0 && (
                  <p className="px-4 py-1.5 text-[10px] font-mono uppercase tracking-widest text-muted-foreground/60 font-semibold select-none">
                    Pages
                  </p>
                )}
                {filteredPages.map((page, i) => {
                  const Icon = page.icon;
                  const globalIdx = pageOffset + i;
                  const isActive = globalIdx === activeIdx;
                  return (
                    <button
                      key={page.href}
                      onClick={() => navigate(page.href, page.external)}
                      onMouseEnter={() => setActiveIdx(globalIdx)}
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors",
                        isActive ? "bg-background" : "hover:bg-background"
                      )}
                    >
                      <div className={cn(
                        "size-7 flex items-center justify-center rounded-sm border shrink-0 transition-colors",
                        isActive ? "border-border bg-card" : "border-border/60 bg-card/50"
                      )}>
                        <Icon className="size-3.5 text-muted-foreground" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="text-[13px] font-medium text-foreground">{page.label}</span>
                        {page.description && (
                          <p className="text-[11px] text-muted-foreground truncate">{page.description}</p>
                        )}
                      </div>
                      {isActive && <ArrowRight className="size-3.5 text-muted-foreground shrink-0" />}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Chats section — only shown when there's a query */}
            {filteredChats.length > 0 && (
              <div className={filteredPages.length > 0 ? "mt-1 border-t border-border/50 pt-1" : ""}>
                <p className="px-4 py-1.5 text-[10px] font-mono uppercase tracking-widest text-muted-foreground/60 font-semibold select-none">
                  Chats
                </p>
                {filteredChats.map((chat, i) => {
                  const globalIdx = chatOffset + i;
                  const isActive = globalIdx === activeIdx;
                  const href = chat.project_id
                    ? `/projects/${chat.project_id}/chat/${chat.id}`
                    : `/chat/${chat.id}`;
                  const updatedAt = chat.updated_at || chat.created_at;
                  const dateStr = updatedAt
                    ? new Date(updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                    : null;
                  return (
                    <button
                      key={chat.id}
                      onClick={() => navigate(href)}
                      onMouseEnter={() => setActiveIdx(globalIdx)}
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors",
                        isActive ? "bg-background" : "hover:bg-background"
                      )}
                    >
                      <div className={cn(
                        "size-7 flex items-center justify-center rounded-sm border shrink-0 transition-colors",
                        isActive ? "border-border bg-card" : "border-border/60 bg-card/50"
                      )}>
                        {chat.is_pinned
                          ? <Pin className="size-3.5 text-muted-foreground" />
                          : <MessageSquare className="size-3.5 text-muted-foreground" />
                        }
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="text-[13px] font-medium text-foreground truncate block">
                          {chat.title || "New Chat"}
                        </span>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {chat.project_id && (
                            <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground/70 font-mono">
                              <Folder className="size-2.5" />
                              project
                            </span>
                          )}
                          {dateStr && (
                            <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground/60 font-mono">
                              <Clock className="size-2.5" />
                              {dateStr}
                            </span>
                          )}
                        </div>
                      </div>
                      {isActive && <ArrowRight className="size-3.5 text-muted-foreground shrink-0" />}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Empty */}
            {showEmpty && (
              <div className="px-4 py-10 text-center">
                <p className="text-sm text-muted-foreground font-mono">No results for &quot;{query}&quot;</p>
              </div>
            )}

            {/* Default hint — no query yet */}
            {!query.trim() && (
              <div className="px-4 py-1.5">
                <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/60 font-semibold select-none mb-1">
                  Pages
                </p>
              </div>
            )}
          </div>

          {/* Footer hint */}
          <div className="border-t border-border px-4 py-2 flex items-center gap-3 text-[10px] font-mono text-muted-foreground/60">
            <span className="flex items-center gap-1">
              <kbd className="inline-flex h-4 items-center rounded border border-border bg-background px-1 text-[9px]">↑↓</kbd>
              navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="inline-flex h-4 items-center rounded border border-border bg-background px-1 text-[9px]">↵</kbd>
              select
            </span>
            <span className="flex items-center gap-1">
              <kbd className="inline-flex h-4 items-center rounded border border-border bg-background px-1 text-[9px]">ESC</kbd>
              close
            </span>
            {query.trim() && filteredChats.length === MAX_CHATS && (
              <span className="ml-auto text-muted-foreground/50">showing top {MAX_CHATS} chats</span>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
