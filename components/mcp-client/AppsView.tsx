"use client";

import React, { useState, useMemo, useEffect } from "react";
import { Search, Plus, ShieldCheck, Loader2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { McpServer } from "@/types/mcp";
import { UserSession } from "@/components/providers/AuthProvider";
import { ServerIcon } from "@/components/common/ServerIcon";
import { useMcpStore } from "@/lib/stores/mcp-store";
import { usePublicServers } from "@/hooks/usePublicServers";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface AppsViewProps {
  userSession: UserSession | null;
  onSelectApp: (server: McpServer) => void;
  onAction: (server: McpServer, action: "activate" | "deactivate") => Promise<unknown>;
  onAddApp?: () => void;
}

export function AppsView({ userSession, onSelectApp, onAction, onAddApp }: AppsViewProps) {
  const [activeTab, setActiveTab] = useState<"all" | "connected">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [connectingId, setConnectingId] = useState<string | null>(null);

  const searchParams = useSearchParams();

  // Pre-fill search from ?q=
  useEffect(() => {
    const q = searchParams.get("q");
    if (q) setSearchQuery(q);
  }, [searchParams]);

  const connections = useMcpStore((s) => s.connections);

  // Fetch servers from API — search & category are sent server-side
  const { servers, loading, isLoadingMore, hasNextPage, totalCount, loadMore } = usePublicServers({
    search: searchQuery,
    categorySlug: selectedCategory !== "all" ? selectedCategory : undefined,
  });

  // Extract unique categories from loaded pages (used for filter strip)
  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const server of servers) {
      if (server.categories && Array.isArray(server.categories)) {
        for (const c of server.categories) {
          if (c.name) set.add(c.name);
        }
      }
    }
    return ["all", ...Array.from(set)];
  }, [servers]);

  // "Connected" tab — build list from active connections in the store.
  // We use metadata.catalogServerId (= mcp_servers.id) as the entry id when available
  // so that onSelectApp → ?server=<mcp_servers.id> and McpClientLayout resolves correctly.
  // For non-catalog servers we fall back to sessionId, which McpClientLayout resolves via connections[sessionId].
  const displayedApps = useMemo((): McpServer[] => {
    if (activeTab !== "connected") return servers;

    const isActive = (status?: string) =>
      status?.toUpperCase() === "READY" || status?.toUpperCase() === "CONNECTED";

    const seen = new Map<string, McpServer>();

    for (const conn of Object.values(connections)) {
      if (!isActive(conn.connectionStatus)) continue;

      // The navigation ID: prefer the catalog UUID stored in metadata, fall back to sessionId
      const navId = conn.metadata?.catalogServerId ?? conn.sessionId;

      // Prefer the full catalog entry if already loaded (matched by catalog UUID)
      const catalogEntry = conn.metadata?.catalogServerId
        ? servers.find((s) => s.id === conn.metadata!.catalogServerId)
        : undefined;

      const entry: McpServer = catalogEntry ?? {
        id: navId,
        name: conn.serverName || "MCP Server",
        url: conn.url ?? undefined,
        transport: conn.transport ?? "streamable-http",
        tools: conn.tools ?? [],
        connectionStatus: conn.connectionStatus,
        isPublic: true,
        requiresOauth2: false,
        description: "",
        updated_at: conn.connectedAt ?? new Date().toISOString(),
      };

      seen.set(navId, entry);
    }

    return Array.from(seen.values());
  }, [servers, connections, activeTab]);

  return (
    <div className="flex-1 overflow-y-auto bg-background text-foreground scrollbar-minimal w-full">
      <div className="p-6 sm:p-8 space-y-6 max-w-6xl mx-auto w-full">
        {/* 1. Top Title & Actions Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-medium tracking-tight text-foreground font-sans">
              Apps
            </h1>
            <p className="text-xs text-muted-foreground font-mono mt-0.5">
              Discover, connect and configure modular MCP tools for your AI agents
            {totalCount > 0 && (
              <span className="ml-1.5 text-muted-foreground/60">· {totalCount.toLocaleString()} total</span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {onAddApp && (
            <Button
              size="sm"
              onClick={onAddApp}
              className="inline-flex items-center gap-1.5 px-3 h-8 rounded-sm text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <Plus className="size-3.5" />
              <span>Add App</span>
            </Button>
          )}
        </div>
      </div>

      {/* 2. Filter Tabs & Search Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
        {/* All vs Connected Tabs */}
        <div className="flex items-center gap-1 bg-card border border-border p-1 rounded-sm w-fit">
          <button
            onClick={() => setActiveTab("all")}
            className={cn(
              "px-4 py-2 text-xs font-medium rounded-sm transition-all cursor-pointer",
              activeTab === "all"
                ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            All
          </button>
          <button
            onClick={() => setActiveTab("connected")}
            className={cn(
              "px-4 py-2 text-xs font-medium rounded-sm transition-all cursor-pointer flex items-center gap-1.5",
              activeTab === "connected"
                ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <span>Connected</span>
          </button>
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-72">
          {loading && searchQuery ? (
            <Loader2 className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground animate-spin" />
          ) : (
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          )}
          <Input
            placeholder="Search apps..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setSelectedCategory("all");
            }}
            className="h-10 pl-8 pr-3 w-full text-xs bg-card border-border font-mono placeholder:font-sans rounded-sm"
          />
        </div>
      </div>

      {/* 3. Category Tags Strip */}
      {!loading && categories.length > 2 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={cn(
                "px-2.5 py-1 text-[11px] font-mono rounded-sm border transition-colors whitespace-nowrap capitalize cursor-pointer",
                selectedCategory === cat
                  ? "bg-card border-body-strong/60 text-foreground font-medium"
                  : "bg-transparent border-border/60 text-muted-foreground hover:text-foreground hover:border-border"
              )}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {/* 4. Loading skeleton */}
      {loading && servers.length === 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="bg-card border border-border rounded-md p-4 flex flex-col justify-between gap-4 animate-pulse"
            >
              <div className="flex items-start gap-3">
                <div className="size-12 shrink-0 rounded-sm bg-border/50" />
                <div className="flex-1 space-y-2 pt-0.5">
                  <div className="h-3 w-2/3 rounded bg-border/50" />
                  <div className="h-2.5 w-full rounded bg-border/40" />
                  <div className="h-2.5 w-4/5 rounded bg-border/40" />
                </div>
              </div>
              <div className="h-2.5 w-1/3 rounded bg-border/40" />
            </div>
          ))}
        </div>
      )}

      {/* 5. Empty state */}
      {!loading && displayedApps.length === 0 && (
        <div className="bg-card border border-border rounded-md p-12 text-center space-y-3">
          <p className="text-sm text-muted-foreground font-mono">
            {activeTab === "connected"
              ? "No connected apps found. Switch to 'All' to connect apps."
              : searchQuery
              ? `No apps found for "${searchQuery}".`
              : "No apps available."}
          </p>
        </div>
      )}

      {/* 6. App Cards Grid */}
      {displayedApps.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {displayedApps.map((app) => {
            // For the connected tab, app.connectionStatus is already set from the store.
            // For the all tab, look up active connection by serverId (mcp_servers.id).
            const connStatus =
              app.connectionStatus ??
              Object.values(connections).find((c) => c.serverId === app.id)
                ?.connectionStatus;
            const isConnected =
              connStatus?.toUpperCase() === "READY" ||
              connStatus?.toUpperCase() === "CONNECTED";

            return (
              <div
                key={app.id}
                onClick={() => onSelectApp(app)}
                className="group bg-card hover:bg-card/90 border border-border hover:border-body-strong/40 rounded-md p-3.5 flex flex-col justify-between gap-3.5 cursor-pointer transition-all duration-150 relative"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="size-12 shrink-0 flex items-center justify-center rounded-sm bg-background border border-border p-1.5">
                      <ServerIcon
                        serverName={app.name}
                        serverUrl={app.url}
                        size={36}
                      />
                    </div>
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        <h2 className="text-[13px] font-medium text-foreground truncate group-hover:text-primary transition-colors">
                          {app.name}
                        </h2>
                        {isConnected && (
                          <ShieldCheck className="size-3.5 text-emerald-400 shrink-0" />
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                        {app.description || ""}
                      </p>
                    </div>
                  </div>

                  {/* Top Right Action / Badge */}
                  <div className="shrink-0">
                    {isConnected ? (
                      <div className="flex items-center gap-1 text-[11px] font-mono text-emerald-500 border border-emerald-500/40 px-2 py-0.5 rounded-sm">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        <span>Active</span>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        disabled={connectingId === app.id}
                        onClick={async (e) => {
                          e.stopPropagation();
                          setConnectingId(app.id);
                          try {
                            await onAction(app, "activate");
                          } finally {
                            setConnectingId(null);
                          }
                        }}
                        className="h-7 px-3 text-xs bg-primary text-primary-foreground hover:bg-primary/90 font-medium rounded-sm min-w-[72px]"
                      >
                        {connectingId === app.id ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          "Connect"
                        )}
                      </Button>
                    )}
                  </div>
                </div>

                {/* Card Footer: category only */}
                {app.categories?.[0]?.name && (
                  <div className="text-[11px] font-mono text-muted-foreground/70 capitalize">
                    {app.categories[0].name}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 7. Load More */}
      {hasNextPage && activeTab === "all" && (
        <div className="flex justify-center pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadMore}
            disabled={isLoadingMore}
            className="h-8 px-6 text-xs font-mono rounded-sm border-border"
          >
            {isLoadingMore ? (
              <><Loader2 className="size-3.5 animate-spin mr-2" />Loading...</>
            ) : (
              "Load more apps"
            )}
          </Button>
        </div>
      )}
      </div>
    </div>
  );
}
