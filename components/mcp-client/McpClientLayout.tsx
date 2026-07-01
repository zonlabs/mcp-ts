"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Server, Plug, Wrench, ChevronRight, LayoutDashboard, Activity, Search } from "lucide-react";

import { Toaster } from "react-hot-toast";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { McpServer } from "@/types/mcp";
import ServerForm from "./ServerForm";
import { ServerSidebar } from "./ServerSidebar";
import { ServerDetails } from "./ServerDetails";
import { ServerPlaceholder } from "./ServerPlaceholder";
import ToolsExplorer from "./ToolsExplorer";
import { useMcpStore, type McpStore } from "@/lib/stores/mcp-store";
import { useMcpConnection } from "@/hooks/useMcpConnection";
import { UserSession } from "@/components/providers/AuthProvider";
import Logo from "@/components/common/Logo";
import { ThemeToggle } from "@/components/common/ThemeToggle";
import { ProfileDropdown } from "@/components/common/ProfileDropdown";
import { ServerIcon } from "@/components/common/ServerIcon";

const ToolExecutionPanel = dynamic(() => import("./ToolExecutionPanel"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
    </div>
  ),
});

const RemoteMcpPanel = dynamic(
  () => import("@/components/remote-mcp/RemoteMcpPanel"),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-full">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
      </div>
    ),
  },
);


interface McpClientLayoutProps {
  publicServers: McpServer[] | null;
  userServers: McpServer[] | null;
  featuredServers?: McpServer[] | null;
  publicServersCount?: number;
  userServersCount?: number;
  publicLoading: boolean;
  userLoading: boolean;
  publicError: string | null;
  userError: string | null;
  session: UserSession | null;
  userSession?: UserSession | null;
  onRefreshPublic: () => void;
  onRefreshUser: () => void;
  onServerAction: (server: McpServer, action: 'activate' | 'deactivate') => Promise<unknown>;
  onServerAdd: (data: Record<string, unknown>) => Promise<void>;
  onServerUpdate: (data: Record<string, unknown>) => Promise<void>;
  onServerDelete: (serverId: string) => Promise<void>;
  onUpdatePublicServer: (serverId: string, updates: Partial<McpServer>) => void;
  onUpdateUserServer: (serverId: string, updates: Partial<McpServer>) => void;
  hasNextPage: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
  initialSelectedServer?: McpServer | null;
}

export default function McpClientLayout({
  publicServers,
  userServers,
  featuredServers = null,
  publicServersCount = 0,
  userServersCount = 0,
  publicLoading,
  userLoading,
  publicError,
  userError,
  session,
  userSession,
  onRefreshPublic,
  onRefreshUser,
  onServerAction,
  onServerAdd,
  onServerUpdate,
  onServerDelete,
  hasNextPage,
  isLoadingMore,
  onLoadMore,
  initialSelectedServer = null,
}: McpClientLayoutProps) {
  const [toolTesterOpen, setToolTesterOpen] = useState(false);
  const [selectedToolName, setSelectedToolName] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const [panelWidth, setPanelWidth] = useState(450);
  const isResizingRef = useRef(false);

  const startResizing = useCallback((mouseDownEvent: React.MouseEvent) => {
    mouseDownEvent.preventDefault();
    isResizingRef.current = true;
    const startWidth = panelWidth;
    const startX = mouseDownEvent.clientX;

    const doDrag = (mouseMoveEvent: MouseEvent) => {
      if (!isResizingRef.current) return;
      const deltaX = mouseMoveEvent.clientX - startX;
      const newWidth = Math.max(320, Math.min(800, startWidth - deltaX));
      setPanelWidth(newWidth);
    };

    const stopDrag = () => {
      isResizingRef.current = false;
      document.removeEventListener("mousemove", doDrag);
      document.removeEventListener("mouseup", stopDrag);
    };

    document.addEventListener("mousemove", doDrag);
    document.addEventListener("mouseup", stopDrag);
  }, [panelWidth]);

  // View State Management

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [serverToDelete, setServerToDelete] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'public' | 'user'>('public');

  const activeServersCount = useMcpStore((state: McpStore) => state.activeConnectionCount);
  const connections = useMcpStore((state: McpStore) => state.connections);
  const totalAvailableTools = useMemo(() =>
    Object.values(connections).reduce((sum, c) => sum + (c.tools?.length || 0), 0),
    [connections]
  );
  const getConnectionByServerId = useMcpStore((state: McpStore) => state.getConnectionByServerId);
  const { mergeWithStoredState } = useMcpConnection();

  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const categorySlug = searchParams.get("category");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(categorySlug);

  useEffect(() => {
    setSelectedCategory(categorySlug);
  }, [categorySlug]);

  const handleOpenRemoteMcp = (tab: "mcp-server" | "revoke" = "mcp-server") => {
    if (!session?.user) {
      router.push("/signin?redirect=/mcp");
      return;
    }
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", "activity");
    params.set("tab", tab);
    params.delete("server");
    params.delete("remote-mcp");
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const handleShowPopular = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", "popular");
    params.delete("server");
    params.delete("remote-mcp");
    params.delete("tab");
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  // Merge connection state into server lists using the shared utility
  const mergedPublicServers = useMemo(() =>
    publicServers ? mergeWithStoredState(publicServers) : publicServers,
    [publicServers, mergeWithStoredState]
  );

  const mergedUserServers = useMemo(() =>
    userServers ? mergeWithStoredState(userServers) : userServers,
    [userServers, mergeWithStoredState]
  );

  // Get current servers and error based on active tab
  const currentServers = activeTab === 'public' ? mergedPublicServers : mergedUserServers;

  const viewParam = searchParams.get("view");
  const serverParam = searchParams.get("server");
  const hasRemoteMcp =
    viewParam === "activity" ||
    searchParams.has("remote-mcp") ||
    viewParam === "remote-mcp";

  const viewMode = useMemo(() => {
    if (viewParam === "add") return "add";
    if (viewParam === "edit") return "edit";
    return "browse";
  }, [viewParam]);

  const selectedServer = useMemo(() => {
    if (hasRemoteMcp) return null;
    if (!serverParam) return null;

    const found =
      mergedPublicServers?.find((s) => s.id === serverParam) ||
      mergedUserServers?.find((s) => s.id === serverParam);
    if (found) return found;

    if (initialSelectedServer && initialSelectedServer.id === serverParam) {
      const storedConnection =
        getConnectionByServerId(initialSelectedServer.id) ||
        (initialSelectedServer.url ? getConnectionByServerId(initialSelectedServer.url) : undefined);
      if (storedConnection) {
        return {
          ...initialSelectedServer,
          connectionStatus: storedConnection.connectionStatus,
          tools: storedConnection.tools || [],
          transport: storedConnection.transport || initialSelectedServer.transport,
          url: storedConnection.url || initialSelectedServer.url,
        };
      }
      return initialSelectedServer;
    }
    return null;
  }, [serverParam, hasRemoteMcp, mergedPublicServers, mergedUserServers, initialSelectedServer, getConnectionByServerId]);

  const editingServer = useMemo(() => {
    if (viewMode !== "edit" || !serverParam) return null;
    return (
      mergedPublicServers?.find((s) => s.id === serverParam) ||
      mergedUserServers?.find((s) => s.id === serverParam) ||
      null
    );
  }, [viewMode, serverParam, mergedPublicServers, mergedUserServers]);

  // Handle tool tester panel visibility on server selection or connection status change
  useEffect(() => {
    if (selectedServer) {
      const isConnected = selectedServer.connectionStatus === 'READY';
      setToolTesterOpen(isConnected);
      if (isConnected) {
        setSidebarOpen(false);
      }
    } else {
      setToolTesterOpen(false);
    }
    setSelectedToolName(null);
  }, [selectedServer?.id, selectedServer?.connectionStatus, hasRemoteMcp]);

  const handleAddServer = () => {
    if (!session?.user) {
      router.push("/signin?redirect=/mcp");
      return;
    }
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", "add");
    params.delete("server");
    params.delete("remote-mcp");
    params.delete("tab");
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const handleEditServer = (server: McpServer) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", "edit");
    params.set("server", server.id);
    params.delete("remote-mcp");
    params.delete("tab");
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const handleDeleteServer = (serverId: string) => {
    setServerToDelete(serverId);
    setDeleteDialogOpen(true);
  };

  const serverToDeleteName = useMemo(() => {
    if (!serverToDelete) return null;
    const inUser = mergedUserServers?.find((s) => s.id === serverToDelete);
    if (inUser?.name) return inUser.name;
    const inPublic = mergedPublicServers?.find((s) => s.id === serverToDelete);
    return inPublic?.name || serverToDelete;
  }, [serverToDelete, mergedUserServers, mergedPublicServers]);

  const confirmDeleteServer = async () => {
    if (!serverToDelete) return;

    try {
      await onServerDelete(serverToDelete);
      if (selectedServer?.id === serverToDelete) {
        handleShowPopular();
      }
      setDeleteDialogOpen(false);
      setServerToDelete(null);
    } catch (error) {
      // Error handled by toast notification
    }
  };

  const handleCancelForm = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("view");
    params.delete("server");
    router.push(pathname, { scroll: false });
  };

  const handleFormSubmit = async (data: Record<string, unknown>) => {
    if (viewMode === 'add') {
      await onServerAdd(data);
    } else {
      await onServerUpdate(data);
    }
    const params = new URLSearchParams(searchParams.toString());
    params.delete("view");
    params.delete("server");
    router.push(pathname, { scroll: false });
  };

  const handleCategorySelect = (slug: string) => {
    const next = slug || null;
    setSelectedCategory(next);
    const params = new URLSearchParams(searchParams.toString());
    if (next) {
      params.set("category", next);
    } else {
      params.delete("category");
    }
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const handleServerSelect = (server: McpServer | null) => {
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches) {
      setSidebarOpen(false);
    }

    const params = new URLSearchParams(searchParams.toString());
    params.delete("view");
    params.delete("remote-mcp");
    params.delete("tab");
    if (server) {
      params.set("server", server.id);
    } else {
      params.delete("server");
    }
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  // Header Search Input State
  const [headerSearchQuery, setHeaderSearchQuery] = useState("");
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setIsSearchFocused(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const [headerSearchResults, setHeaderSearchResults] = useState<McpServer[]>([]);
  const [headerSearchLoading, setHeaderSearchLoading] = useState(false);

  useEffect(() => {
    if (!headerSearchQuery.trim()) {
      setHeaderSearchResults([]);
      return;
    }

    const controller = new AbortController();
    setHeaderSearchLoading(true);

    const timer = setTimeout(async () => {
      try {
        const query = encodeURIComponent(headerSearchQuery.trim());
        const res = await fetch(`/api/mcp?first=10&public=true&search=${query}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error("Search failed");
        const json = await res.json();
        
        // Merge user servers manually to search local user servers as well
        const localMatches = (mergedUserServers || []).filter(
          (s) =>
            s.name.toLowerCase().includes(headerSearchQuery.toLowerCase()) ||
            (s.description && s.description.toLowerCase().includes(headerSearchQuery.toLowerCase()))
        );

        const apiServers = Array.isArray(json.servers) ? json.servers : [];
        const combined = [...localMatches, ...apiServers];
        const seen = new Set();
        const unique = combined.filter((s) => {
          const key = s.id || s.name;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

        setHeaderSearchResults(unique.slice(0, 8));
      } catch { } finally {
        setHeaderSearchLoading(false);
      }
    }, 200);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [headerSearchQuery, mergedUserServers]);




  return (
    <div className="flex-1 flex flex-col bg-background min-h-0">
      {/* Premium Dashboard Top Bar */}
      <div className="relative flex items-center justify-between px-4 sm:px-6 lg:px-8 py-3 bg-background/80 backdrop-blur-xl border-b border-border/40 flex-shrink-0 z-50">
        <div className="flex items-center gap-3 min-w-0 flex-1 mr-4">
          <Link href="/" className="flex items-center gap-2.5 group shrink-0">
            <div className="relative">
              <Logo size={28} />
            </div>
            <span className="text-sm font-semibold text-foreground leading-none hidden sm:inline">MCP Assistant</span>
          </Link>

          {/* Breadcrumb when server selected */}
          {selectedServer && (
            <div className="hidden xl:flex items-center gap-1.5 ml-2 min-w-0">
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="text-xs text-muted-foreground shrink-0">Servers</span>
              <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
              <span className="text-sm font-medium text-foreground truncate">{selectedServer.name}</span>
            </div>
          )}

          {/* Search bar inside Dashboard Header */}
          <div ref={searchContainerRef} className="relative max-w-sm w-full ml-4 block">
            <div className="relative">
              <Input
                id="header-mcp-search"
                type="text"
                placeholder="Search MCP servers..."
                value={headerSearchQuery}
                onChange={(e) => setHeaderSearchQuery(e.target.value)}
                onFocus={() => setIsSearchFocused(true)}
                className="h-9 pl-9 pr-4 text-xs w-full bg-muted/40 border-border/60 focus-visible:bg-background transition-[background-color,border-color] duration-200"
              />
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            </div>

              {isSearchFocused && headerSearchQuery.trim() && (
                <div
                  className="absolute left-0 right-0 mt-2 bg-popover text-popover-foreground border border-border rounded-xl shadow-2xl z-[9999] overflow-hidden max-h-80 flex flex-col isolation-auto"
                  style={{ zIndex: 9999 }}
                >
                  <div className="p-2 border-b border-border/50 bg-muted/30 flex items-center justify-between">
                    <span className="text-[10px] font-medium text-muted-foreground tracking-wider uppercase px-2">
                      Search Results
                    </span>
                    {headerSearchLoading && (
                      <span className="text-[9px] text-muted-foreground animate-pulse pr-2">Searching...</span>
                    )}
                  </div>
                  <div className="overflow-y-auto p-1.5 space-y-0.5">
                    {headerSearchResults.length > 0 ? (
                      headerSearchResults.map((server) => (
                        <button
                          key={server.id || server.name}
                          onClick={() => {
                            handleServerSelect(server);
                            setIsSearchFocused(false);
                            setHeaderSearchQuery("");
                          }}
                          className="w-full flex items-center gap-3 px-3 py-2 text-left rounded-lg hover:bg-muted/80 transition-colors duration-150 group"
                        >
                          <ServerIcon
                            serverName={server.name}
                            serverUrl={server.url ?? undefined}
                            size={20}
                            className="rounded-md shrink-0 border border-border/30"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-semibold text-foreground truncate group-hover:text-red-500 transition-colors duration-150">
                                {server.name}
                              </span>
                              {server.isPublic ? (
                                <span className="text-[9px] px-1.5 py-0.5 rounded border border-red-500/20 bg-red-500/5 text-red-600 dark:text-red-400">Public</span>
                              ) : (
                                <span className="text-[9px] px-1.5 py-0.5 rounded border border-amber-500/20 bg-amber-500/5 text-amber-600 dark:text-amber-400">My Server</span>
                              )}
                            </div>
                            {server.description && (
                              <p className="text-[10px] text-muted-foreground line-clamp-1 mt-0.5">
                                {server.description}
                              </p>
                            )}
                          </div>
                        </button>
                      ))
                    ) : (
                      <div className="p-4 text-center">
                        <p className="text-xs text-muted-foreground">
                          {headerSearchLoading ? "Loading matches..." : `No servers found for "${headerSearchQuery}"`}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <ThemeToggle />
          {session?.user ? (
            <ProfileDropdown user={session.user} />
          ) : (
            <Link
              href="/signin"
              className="bg-primary text-primary-foreground px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-primary/90 transition-colors"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>

      <Toaster
        position="top-right"
        toastOptions={{
          duration: 3000,
          style: {
            background: 'rgba(255, 255, 255, 0.95)',
            color: '#000000',
            border: '1px solid #e5e7eb',
            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
            backdropFilter: 'blur(8px)',
          },
        }}
      />

      <div className="flex flex-1 min-h-0 relative">
        {/* Left Sidebar */}
        <ServerSidebar
          publicServers={mergedPublicServers}
          userServers={mergedUserServers}
          publicServersCount={publicServersCount}
          userServersCount={userServersCount}
          publicLoading={publicLoading}
          userLoading={userLoading}
          activeServersCount={activeServersCount}
          selectedServer={selectedServer}
          onServerSelect={handleServerSelect}
          onAddServer={handleAddServer}
          onEditServer={handleEditServer}
          onDeleteServer={handleDeleteServer}
          onRefreshPublic={onRefreshPublic}
          onRefreshUser={onRefreshUser}
          onClose={() => setSidebarOpen(prev => !prev)}
          hasNextPage={hasNextPage}
          isLoadingMore={isLoadingMore}
          onLoadMore={onLoadMore}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          selectedCategory={selectedCategory}
          onCategoryChange={handleCategorySelect}
          session={session}
          userSession={userSession}
          onOpenRemoteMcp={handleOpenRemoteMcp}
          onShowPopular={handleShowPopular}
          sidebarOpen={sidebarOpen}
          onSearchFocus={() => document.getElementById('header-mcp-search')?.focus()}
        />

        {/* Backdrop for Mobile */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/40 z-[75] lg:hidden cursor-pointer"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Main Content Area with Right Panel */}
        <div className="flex-1 flex min-w-0 min-h-0 overflow-y-auto">
          {/* Left Side - Main Content - Hidden on mobile if tool tester is open, hidden if remote MCP is open */}
          {!hasRemoteMcp && (
            <div className={`flex-1 flex flex-col min-w-0 min-h-0 ${toolTesterOpen ? "hidden lg:flex" : "flex"}`}>
                {viewMode === 'add' ? (
                  <div className="flex-1 h-full">
                    <ServerForm
                      mode="add"
                      session={session}
                      onSubmit={handleFormSubmit}
                      onCancel={handleCancelForm}
                    />
                  </div>
                ) : viewMode === 'edit' && editingServer ? (
                  <div className="flex-1 h-full">
                    <ServerForm
                      mode="edit"
                      server={editingServer}
                      session={session}
                      onSubmit={handleFormSubmit}
                      onCancel={handleCancelForm}
                    />
                  </div>
                ) : selectedServer ? (
                  <div className="flex-1 flex flex-col overflow-y-auto">
                    {/* Server Header & Details */}
                    <ServerDetails
                      server={selectedServer}
                      session={session}
                      userSession={userSession}
                      onAction={onServerAction}
                      onEdit={handleEditServer}
                      onDelete={handleDeleteServer}
                      toolTesterOpen={toolTesterOpen}
                      onToggleTools={() => {
                        const newValue = !toolTesterOpen;
                        setToolTesterOpen(newValue);
                        if (newValue) {
                          setSidebarOpen(false);
                        }
                      }}
                    />
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col min-h-0 overflow-y-auto scrollbar-minimal">
                    {/* Stats Overview */}
                    <div className="px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6 pb-2 animate-in fade-in duration-300">
                      <div className="flex items-center gap-2 mb-4">
                        <LayoutDashboard className="h-4 w-4 text-primary" />
                        <h2 className="text-sm font-semibold text-foreground">Overview</h2>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {[
                          {
                            icon: Server,
                            label: "Total Servers",
                            value: publicServersCount + userServersCount,
                          },
                          {
                            icon: Plug,
                            label: "Active Connections",
                            value: activeServersCount,
                          },
                          {
                            icon: Wrench,
                            label: "Available Tools",
                            value: totalAvailableTools,
                          },
                        ].map((stat) => {
                          const Icon = stat.icon;
                          return (
                            <div
                              key={stat.label}
                              className="group relative overflow-hidden rounded-xl border border-red-200/70 dark:border-red-400/20 bg-card/50 backdrop-blur-sm p-4 shadow-sm hover:shadow-md hover:border-red-400 dark:hover:border-red-500/40 transition-[box-shadow,border-color] duration-300 ease-out"
                            >
                              <div className="flex items-start justify-between">
                                <div className="space-y-1">
                                  <p className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">{stat.label}</p>
                                  <p className="text-3xl font-extrabold text-foreground tracking-tight leading-none mt-1">{stat.value}</p>
                                </div>
                                <div className="rounded-lg border border-red-200/30 dark:border-red-400/10 bg-muted/30 p-2.5 transition-[transform,border-color] duration-300 group-hover:scale-105 group-hover:border-red-500/30">
                                  <Icon className="h-4.5 w-4.5 text-muted-foreground group-hover:text-red-500 transition-colors" strokeWidth={2.5} />
                                </div>
                              </div>
                              {/* Decorative corner glow */}
                              <div className="absolute top-0 right-0 w-2 h-2 rounded-bl-full bg-red-500/10 shadow-[0_0_12px_rgba(239,68,68,0.35)] opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    <ServerPlaceholder
                      type="no-selection"
                      featuredServers={featuredServers ?? []}
                    />
                  </div>
                )}
            </div>
          )}

          {/* Right Panel - Tool Execution - Docked on the right, resizable */}
          {toolTesterOpen && selectedServer && (
            <div
              style={{
                width: typeof window !== "undefined" && window.innerWidth >= 1024 ? `${panelWidth}px` : "100%"
              }}
              className="border-l border-border bg-background flex flex-col h-full shrink-0 relative lg:max-w-[80vw] lg:min-w-[320px] w-full"
            >
              {/* Resizer drag handle (vertical line with dots indicator) */}
              <div
                role="separator"
                aria-label="Resize tool panel"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                    const widthChange = e.key === 'ArrowLeft' ? -50 : 50;
                    setPanelWidth((prev) => Math.max(320, Math.min(800, prev + widthChange)));
                  }
                }}
                onMouseDown={startResizing}
                className="absolute top-0 bottom-0 left-[-3px] w-[6px] cursor-col-resize hover:bg-red-700/20 active:bg-red-700/40 transition-colors z-50 flex items-center justify-center group hidden lg:flex select-none"
              >
                <div className="w-[4px] h-8 rounded bg-muted-foreground/30 group-hover:bg-red-700 group-active:bg-red-700 flex flex-col gap-0.5 items-center justify-center py-1">
                  <div className="w-[2px] h-[2px] rounded-full bg-background" />
                  <div className="w-[2px] h-[2px] rounded-full bg-background" />
                  <div className="w-[2px] h-[2px] rounded-full bg-background" />
                </div>
              </div>

              <div className="flex-1 min-w-0 h-full overflow-hidden">
                <ToolExecutionPanel
                  server={selectedServer}
                  tools={Array.isArray(selectedServer.tools) ? selectedServer.tools : []}
                  onClose={() => {
                    setToolTesterOpen(false);
                    setSelectedToolName(null);
                  }}
                  initialToolName={selectedToolName}
                />
              </div>
            </div>
          )}

          {/* Right Panel - Remote MCP - Full width when visible */}
          {hasRemoteMcp && (
            <div className="flex-1 max-w-4xl mx-auto w-full">
              <RemoteMcpPanel
                initialTab={
                  searchParams.get("tab") === "revoke" ||
                  searchParams.has("revoke") ||
                  searchParams.get("remote-mcp") === "revoke"
                    ? "revoke"
                    : "mcp-server"
                }
                onClose={() => {
                  const params = new URLSearchParams(searchParams.toString());
                  params.delete("remote-mcp");
                  params.delete("view");
                  params.delete("tab");
                  params.delete("revoke");
                  params.delete("activity");
                  const qs = params.toString();
                  router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
                }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Server</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{serverToDeleteName || serverToDelete}&quot;? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteServer}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
