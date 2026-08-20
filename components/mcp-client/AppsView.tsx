"use client";

import React, { useState, useMemo, useEffect } from "react";
import { Search, Plus, ShieldCheck, Loader2, Trash2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { McpServer } from "@/types/mcp";
import { UserSession } from "@/components/providers/AuthProvider";
import { ServerIcon } from "@/components/common/ServerIcon";
import { useMcpStore, findConnectionForServer } from "@/lib/stores/mcp-store";
import { usePublicServers } from "@/hooks/usePublicServers";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "react-hot-toast";
import { cn } from "@/lib/utils";

interface AppsViewProps {
  userSession: UserSession | null;
  onSelectApp: (server: McpServer) => void;
  onAction: (server: McpServer, action: "activate" | "deactivate") => Promise<unknown>;
  onDeleteApp?: (serverId: string) => Promise<void>;
  onAddApp?: () => void;
}

export function AppsView({ userSession, onSelectApp, onAction, onDeleteApp, onAddApp }: AppsViewProps) {
  const [activeTab, setActiveTab] = useState<"all" | "my-apps" | "connected">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [serverToDelete, setServerToDelete] = useState<McpServer | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const searchParams = useSearchParams();

  // Pre-fill search from ?q=
  useEffect(() => {
    const q = searchParams.get("q");
    if (q) setSearchQuery(q);
  }, [searchParams]);

  const connections = useMcpStore((s) => s.connections);
  const userServers = useMcpStore((s) => s.userServers);
  const fetchUserServers = useMcpStore((s) => s.fetchUserServers);

  useEffect(() => {
    void fetchUserServers();
  }, [fetchUserServers]);

  // Fetch servers from API — search is sent server-side
  const { servers, loading, isLoadingMore, hasNextPage, totalCount, loadMore } = usePublicServers({
    search: searchQuery,
  });

  // Connected apps count
  const connectedApps = useMemo((): McpServer[] => {
    const isActive = (status?: string) =>
      status?.toUpperCase() === "READY" || status?.toUpperCase() === "CONNECTED";

    const seen = new Map<string, McpServer>();

    for (const conn of Object.values(connections)) {
      if (!isActive(conn.connectionStatus)) continue;

      const navId = conn.metadata?.catalogServerId ?? conn.sessionId;
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
  }, [servers, connections]);

  // Filtered displayed apps based on active tab
  const displayedApps = useMemo((): McpServer[] => {
    if (activeTab === "my-apps") {
      if (!searchQuery.trim()) return userServers;
      const q = searchQuery.toLowerCase().trim();
      return userServers.filter(
        (s) =>
          s.name?.toLowerCase().includes(q) ||
          s.description?.toLowerCase().includes(q) ||
          s.url?.toLowerCase().includes(q)
      );
    }

    if (activeTab === "connected") {
      if (!searchQuery.trim()) return connectedApps;
      const q = searchQuery.toLowerCase().trim();
      return connectedApps.filter(
        (s) =>
          s.name?.toLowerCase().includes(q) ||
          s.description?.toLowerCase().includes(q) ||
          s.url?.toLowerCase().includes(q)
      );
    }

    return servers;
  }, [servers, connectedApps, userServers, activeTab, searchQuery]);

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
              Discover, connect and configure MCP tools for your AI agents
            {activeTab === "all" && totalCount > 0 && (
              <span className="ml-1.5 text-muted-foreground/60">· {totalCount.toLocaleString()} total</span>
            )}
            {activeTab === "my-apps" && (
              <span className="ml-1.5 text-muted-foreground/60">· {userServers.length} custom apps</span>
            )}
            {activeTab === "connected" && (
              <span className="ml-1.5 text-muted-foreground/60">· {connectedApps.length} connected</span>
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
        {/* All vs My Apps vs Connected Tabs */}
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
            onClick={() => setActiveTab("my-apps")}
            className={cn(
              "px-4 py-2 text-xs font-medium rounded-sm transition-all cursor-pointer flex items-center gap-1.5",
              activeTab === "my-apps"
                ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <span>My Apps</span>
            {userServers.length > 0 && (
              <span className={cn(
                "text-[10px] font-mono",
                activeTab === "my-apps" ? "text-primary-foreground/90 font-semibold" : "text-muted-foreground"
              )}>
                ({userServers.length})
              </span>
            )}
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
            {connectedApps.length > 0 && (
              <span className={cn(
                "text-[10px] font-mono",
                activeTab === "connected" ? "text-primary-foreground/90 font-semibold" : "text-emerald-500"
              )}>
                ({connectedApps.length})
              </span>
            )}
          </button>
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search apps..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-10 pl-8 pr-3 w-full text-xs bg-card border-border font-mono placeholder:font-sans rounded-sm"
          />
        </div>
      </div>

      {/* 4. Loading skeleton */}
      {loading && (
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
              ? "No connected apps found. Switch to 'All' or 'My Apps' to connect apps."
              : activeTab === "my-apps"
              ? searchQuery
                ? `No custom apps found for "${searchQuery}".`
                : "No custom apps added yet. Click 'Add App' above to configure your first MCP server."
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
            // For the all tab, look up active connection by serverId or catalogServerId or URL.
            const stored = findConnectionForServer(connections, app);
            const connStatus = (
              stored?.connectionStatus ??
              app.connectionStatus ??
              Object.values(connections).find(
                (c) => c.serverId === app.id || c.metadata?.catalogServerId === app.id
              )?.connectionStatus
            )?.toUpperCase();
            const isConnected =
              connStatus === "READY" ||
              connStatus === "CONNECTED";
            const isInProgress = Boolean(
              connectingId === app.id ||
              (connStatus && [
                "INITIALIZING",
                "VALIDATING",
                "CONNECTING",
                "AUTHENTICATING",
                "AUTHENTICATED",
                "DISCOVERING",
              ].includes(connStatus))
            );

            const isOwner = Boolean(
              userSession?.user?.id && (
                app.owner === userSession.user.id ||
                userServers.some((s) => s.id === app.id) ||
                (!app.isVerified && !app.isPublic)
              )
            );

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
                        icon={app.icon}
                        size={36}
                      />
                    </div>
                    <div className="min-w-0 space-y-0.5">
                      <h2 className="text-[13px] font-medium text-foreground truncate group-hover:text-primary transition-colors">
                        {app.name}
                      </h2>
                      <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                        {app.description || ""}
                      </p>
                    </div>
                  </div>

                  {/* Top Right Action Button */}
                  <div className="shrink-0 flex items-center gap-1.5">
                    {isConnected ? (
                      <div className="flex items-center gap-1 text-[11px] font-mono text-emerald-500 border border-emerald-500/40 px-2 py-0.5 rounded-sm">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        <span>Active</span>
                      </div>
                    ) : connStatus === "AUTHENTICATING" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={connectingId === app.id}
                        onClick={async (e) => {
                          e.stopPropagation();
                          setConnectingId(app.id);
                          try {
                            await onAction(app, "deactivate");
                          } finally {
                            setConnectingId(null);
                          }
                        }}
                        className="h-7 px-2.5 text-xs border border-destructive/50 text-destructive hover:bg-destructive hover:text-destructive-foreground font-medium rounded-sm inline-flex items-center gap-1 cursor-pointer"
                      >
                        Cancel Auth
                      </Button>
                    ) : (connStatus === "INITIALIZING" || connStatus === "VALIDATING" || connStatus === "CONNECTING" || connStatus === "AUTHENTICATED" || connStatus === "DISCOVERING" || connectingId === app.id) ? (
                      <Button
                        size="sm"
                        disabled
                        className="h-7 px-3 text-xs bg-primary/80 text-primary-foreground font-medium rounded-sm min-w-[72px] inline-flex items-center gap-1.5 cursor-wait"
                      >
                        <Loader2 className="size-3.5 animate-spin" />
                        <span>
                          {connStatus === "INITIALIZING"
                            ? "Initializing"
                            : connStatus === "VALIDATING"
                              ? "Validating"
                              : connStatus === "AUTHENTICATED"
                                ? "Authenticated"
                                : connStatus === "DISCOVERING"
                                  ? "Discovering"
                                  : "Connecting"}
                        </span>
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        onClick={async (e) => {
                          e.stopPropagation();
                          setConnectingId(app.id);
                          try {
                            await onAction(app, "activate");
                          } finally {
                            setConnectingId(null);
                          }
                        }}
                        className="h-7 px-3 text-xs bg-primary text-primary-foreground hover:bg-primary/90 font-medium rounded-sm min-w-[72px] inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        Connect
                      </Button>
                    )}

                    {isOwner && onDeleteApp && (
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          setServerToDelete(app);
                        }}
                        className="h-7 w-7 p-0 border border-border text-muted-foreground hover:text-destructive hover:bg-destructive/10 hover:border-destructive/40 rounded-sm cursor-pointer"
                        title="Delete App"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    )}
                  </div>
                </div>

                {/* Card Footer */}
                {Boolean(app.categories?.[0]?.name || (isOwner && (app.createdAt || (app as any).created_at)) || (isConnected && stored?.connectedAt)) && (
                  <div className="flex items-center justify-between gap-2 text-[11px] font-mono text-muted-foreground/60 pt-1">
                    {app.categories?.[0]?.name ? (
                      <span className="truncate capitalize">{app.categories[0].name}</span>
                    ) : (
                      <span />
                    )}

                    {isOwner && (app.createdAt || (app as any).created_at) ? (
                      <span
                        className="shrink-0 cursor-default hover:text-foreground transition-colors"
                        title={[
                          `Created on ${new Date(app.createdAt || (app as any).created_at).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}`,
                          isConnected && stored?.connectedAt
                            ? `Connected on ${new Date(stored.connectedAt).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}`
                            : null,
                        ].filter(Boolean).join(" • ")}
                      >
                        Created on {new Date(app.createdAt || (app as any).created_at).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </span>
                    ) : isConnected && stored?.connectedAt ? (
                      <span
                        className="shrink-0 cursor-default hover:text-foreground transition-colors"
                        title={`Connected on ${new Date(stored.connectedAt).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}`}
                      >
                        Connected on {new Date(stored.connectedAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </span>
                    ) : null}
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

      {/* Delete Confirmation Dialog */}
      <Dialog open={Boolean(serverToDelete)} onOpenChange={(open) => !open && setServerToDelete(null)}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-sm border-border bg-card p-5 text-foreground shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">Delete Server</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <p className="text-xs text-muted-foreground leading-relaxed">
              Are you sure you want to delete <span className="font-semibold text-foreground">{serverToDelete?.name}</span>? This will permanently remove this MCP server from your account.
            </p>
            <div className="flex items-center justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={isDeleting}
                onClick={() => setServerToDelete(null)}
                className="h-8 px-3 text-xs cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={isDeleting}
                onClick={async () => {
                  if (!serverToDelete || !onDeleteApp) return;
                  setIsDeleting(true);
                  try {
                    await onDeleteApp(serverToDelete.id);
                    void fetchUserServers();
                    toast.success(`${serverToDelete.name} deleted successfully`);
                    setServerToDelete(null);
                  } catch (err: any) {
                    toast.error(err?.message || "Failed to delete server");
                  } finally {
                    setIsDeleting(false);
                  }
                }}
                className="h-8 px-3.5 text-xs cursor-pointer"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="size-3 mr-1.5 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  "Delete"
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
}
