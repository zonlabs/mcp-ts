"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Home,
  LayoutGrid,
  MessageSquare,
  KeyRound,
  SlidersHorizontal,
  FileText,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SearchDialogProps {
  open: boolean;
  onClose: () => void;
}

const PAGES = [
  { label: "Home", href: "/mcp?tab=home", icon: Home, description: "Activity overview and MCP telemetry" },
  { label: "Apps", href: "/mcp?tab=apps", icon: LayoutGrid, description: "Connect and manage MCP servers" },
  { label: "Playground", href: "/chat", icon: MessageSquare, description: "Chat with AI and run tools" },
  { label: "API Keys", href: "/settings/api-keys", icon: KeyRound, description: "Manage your API credentials" },
  { label: "Settings", href: "/settings/preferences", icon: SlidersHorizontal, description: "Preferences and configuration" },
  { label: "Documentation", href: "https://docs.mcp-assistant.in/", icon: FileText, description: "Guides and API references", external: true },
];

export function SearchDialog({ open, onClose }: SearchDialogProps) {
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

  const totalItems = filteredPages.length;

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
        const page = filteredPages[activeIdx];
        if (page) navigate(page.href, page.external);
      } else if (e.key === "Escape") {
        onClose();
      }
    },
    [activeIdx, filteredPages, navigate, onClose, totalItems]
  );

  if (!open) return null;

  const showEmpty = query.trim() && filteredPages.length === 0;

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
              placeholder="Search pages..."
              className="flex-1 bg-transparent text-sm font-sans text-foreground placeholder:text-muted-foreground outline-none"
            />
            <kbd className="hidden sm:inline-flex h-5 items-center gap-0.5 rounded border border-border bg-background px-1.5 font-mono text-[10px] text-muted-foreground select-none">
              ESC
            </kbd>
          </div>

          {/* Results */}
          <div className="max-h-[380px] overflow-y-auto scrollbar-minimal py-2">
            {/* Pages */}
            {filteredPages.length > 0 && (
              <div>
                <p className="px-4 py-1.5 text-[10px] font-mono uppercase tracking-widest text-muted-foreground/60 font-semibold select-none">
                  Pages
                </p>
                {filteredPages.map((page, i) => {
                  const Icon = page.icon;
                  const isActive = i === activeIdx;
                  return (
                    <button
                      key={page.href}
                      onClick={() => navigate(page.href, page.external)}
                      onMouseEnter={() => setActiveIdx(i)}
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

            {/* Empty */}
            {showEmpty && (
              <div className="px-4 py-10 text-center">
                <p className="text-sm text-muted-foreground font-mono">No results for &quot;{query}&quot;</p>
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
          </div>
        </div>
      </div>
    </>
  );
}
