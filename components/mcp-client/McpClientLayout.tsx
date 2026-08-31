"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, X } from "lucide-react";
import { toast } from "react-hot-toast";

import { HomeView } from "./HomeView";
import { AppsView } from "./AppsView";
import { AppDetailView } from "./AppDetailView";
import { ServerIcon } from "@/components/common/ServerIcon";
import { SimpleTooltip } from "@/components/ui/tooltip";
import { McpServer } from "@/types/mcp";
import { findConnectionForServer } from "@/lib/mcp/connection-utils";
import type { McpConnection } from "@mcp-ts/client/react";
import { useMcpConnection } from "@/hooks/useMcpConnection";
import { useMcpContext } from "@/components/providers/McpProvider";
import { UserSession } from "@/components/providers/AuthProvider";
import { usePublicServers } from "@/hooks/usePublicServers";
import { useUserServers } from "@/hooks/useUserServers";
import ServerForm from "./ServerForm";

const ToolExecutionPanel = dynamic(() => import("./ToolExecutionPanel"), {
  ssr: false,
});

interface McpClientLayoutProps {
  session: UserSession | null;
  userSession?: UserSession | null;
  onServerAdd: (data: Record<string, unknown>) => Promise<any>;
  onServerUpdate: (data: Record<string, unknown>) => Promise<any>;
  onServerDelete: (serverId: string) => Promise<void>;
  onServerAction: (server: McpServer, action: "activate" | "deactivate") => Promise<unknown>;
  initialSelectedServer?: McpServer | null;
  initialUsageData?: any;
}

export default function McpClientLayout({
  session,
  userSession,
  onServerAction,
  onServerAdd,
  onServerUpdate,
  onServerDelete,
  initialSelectedServer,
  initialUsageData,
}: McpClientLayoutProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [toolTesterOpen, setToolTesterOpen] = useState(false);
  const [selectedToolName, setSelectedToolName] = useState<string | null>(null);
  const [panelWidth, setPanelWidth] = useState(520);
  const isResizingRef = useRef(false);

  const { connect, disconnect } = useMcpConnection();
  const { connections } = useMcpContext();
  const { userServers, refetch: refetchUserServers } = useUserServers();

  // Only fetch the default page size — no need to over-fetch for resolution
  const { servers: catalogServers } = usePublicServers();

  const activeTabParam = searchParams.get("tab") || "home";
  const serverParamFromUrl = searchParams.get("server");

  // Track active tab and selected server locally for 0ms instantaneous navigation without server round-trip
  const [activeTab, setActiveTab] = useState<string>(activeTabParam);
  const [selectedServerId, setSelectedServerId] = useState<string | null>(serverParamFromUrl);
  const [selectedAppObj, setSelectedAppObj] = useState<McpServer | null>(null);

  // Synchronize when browser history back/forward buttons are clicked
  useEffect(() => {
    setActiveTab(searchParams.get("tab") || "home");
    setSelectedServerId(searchParams.get("server"));
  }, [searchParams]);

  // Fallback single server fetch query if direct URL / deep link is accessed
  const { data: fetchedServer } = useQuery<McpServer | null>({
    queryKey: ["mcpServer", selectedServerId],
    queryFn: async () => {
      if (!selectedServerId) return null;
      const res = await fetch(`/api/mcp?id=${encodeURIComponent(selectedServerId)}`);
      if (!res.ok) return null;
      const data = await res.json();
      return data.server || null;
    },
    enabled: Boolean(
      selectedServerId &&
      (!selectedAppObj || selectedAppObj.id !== selectedServerId) &&
      !userServers.some((s) => s.id === selectedServerId) &&
      !catalogServers.some((s) => s.id === selectedServerId)
    ),
    staleTime: 1000 * 60 * 5,
  });

  /**
   * Resolve the selected server for AppDetailView.
   */
  const selectedServer = useMemo((): McpServer | null => {
    if (!selectedServerId) return null;

    // 0. Check explicitly selected app object (e.g. from search results in AppsView)
    if (selectedAppObj && selectedAppObj.id === selectedServerId) {
      return selectedAppObj;
    }

    // 1. Check custom user servers
    const fromUser = userServers.find((s) => s.id === selectedServerId);
    if (fromUser) return fromUser;

    // 2. Check loaded catalog servers by their UUID primary key
    const fromCatalog = catalogServers.find((s) => s.id === selectedServerId);
    if (fromCatalog) return fromCatalog;

    // 3 & 4. Check active connections — prefer metadata.catalogServerId or serverId match,
    // fall back to sessionId (used for custom/non-catalog servers)
    const conn: McpConnection | undefined =
      connections.find((c) => c.metadata?.catalogServerId === selectedServerId) ??
      connections.find((c) => c.sessionId === selectedServerId) ??
      connections.find((c) => c.serverId === selectedServerId);

    if (conn) {
      const catalogServerId = conn.metadata?.catalogServerId;
      const targetId = catalogServerId || conn.serverId || selectedServerId;

      // If connection matches a user server or catalog server, prefer that
      const matchedUserServer = userServers.find(
        (s) => (catalogServerId && s.id === catalogServerId) || s.id === targetId || s.id === conn.serverId
      );
      if (matchedUserServer) return { ...matchedUserServer, id: targetId };

      const matchedCatalogServer = catalogServers.find(
        (s) => (catalogServerId && s.id === catalogServerId) || s.id === targetId || s.id === conn.serverId
      );
      if (matchedCatalogServer) return { ...matchedCatalogServer, id: targetId };

      const resolvedServer: McpServer = {
        id: targetId,
        name: conn.serverName,
        url: conn.serverUrl || undefined,
        transport: conn.transport || "streamable-http",
        tools: (conn.tools as any[]) ?? [],
        connectionStatus: conn.state === "READY" ? "READY" : conn.state,
        headers: (conn as any).headers ?? (conn.metadata as any)?.headers,
        isPublic: true,
        requiresOauth2: false,
        description: "",
        updated_at: conn.updatedAt?.toISOString() || conn.createdAt?.toISOString() || new Date().toISOString(),
      };
      return resolvedServer;
    }

    // 5. Fallback fetched server from query or SSR initialSelectedServer
    return fetchedServer || (initialSelectedServer?.id === selectedServerId ? initialSelectedServer : null);
  }, [selectedServerId, selectedAppObj, userServers, catalogServers, connections, fetchedServer, initialSelectedServer]);

  // Handle navigating to an App detail instantly (0ms)
  const handleSelectApp = useCallback(
    (appOrId: McpServer | string) => {
      const serverId = typeof appOrId === "string" ? appOrId : appOrId.id;
      if (typeof appOrId === "object") {
        setSelectedAppObj(appOrId);
      } else {
        setSelectedAppObj(null);
      }
      setSelectedServerId(serverId);
      const params = new URLSearchParams(window.location.search);
      params.set("tab", "apps");
      params.set("server", serverId);
      params.delete("view");
      window.history.pushState(null, "", `${pathname}?${params.toString()}`);
    },
    [pathname]
  );

  // Handle returning back to Apps catalog instantly (0ms)
  const handleBackToApps = useCallback(() => {
    setSelectedAppObj(null);
    setSelectedServerId(null);
    setToolTesterOpen(false);
    setSelectedToolName(null);
    const params = new URLSearchParams(window.location.search);
    params.delete("server");
    params.delete("view");
    params.set("tab", "apps");
    window.history.pushState(null, "", `${pathname}?${params.toString()}`);
  }, [pathname]);

  // Handle testing a specific tool in the slide-over panel
  const handleTestTool = useCallback((toolName: string) => {
    setSelectedToolName(toolName);
    setToolTesterOpen(true);
  }, []);

  const startResizing = useCallback((mouseDownEvent: React.MouseEvent) => {
    mouseDownEvent.preventDefault();
    isResizingRef.current = true;
    const startWidth = panelWidth;
    const startX = mouseDownEvent.clientX;

    const doDrag = (mouseMoveEvent: MouseEvent) => {
      if (!isResizingRef.current) return;
      const deltaX = mouseMoveEvent.clientX - startX;
      const newWidth = Math.max(380, Math.min(900, startWidth - deltaX));
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

  // Handle adding a new app
  const handleAddApp = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "apps");
    params.set("view", "add");
    params.delete("server");
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }, [router, pathname, searchParams]);

  // Handle editing an app
  const handleEditApp = useCallback(
    (server: McpServer) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", "apps");
      params.set("server", server.id);
      params.set("view", "edit");
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams]
  );

  // Handle navigating from Home to Apps instantly (0ms)
  const handleNavigateToApps = useCallback(() => {
    setActiveTab("apps");
    setSelectedServerId(null);
    const params = new URLSearchParams(window.location.search);
    params.set("tab", "apps");
    params.delete("server");
    params.delete("view");
    window.history.pushState(null, "", `${pathname}?${params.toString()}`);
  }, [pathname]);

  // Determine active view
  const viewParam = searchParams.get("view");
  const currentView = useMemo(() => {
    if (viewParam === "add") return "add";
    if (viewParam === "edit" && selectedServer) return "edit";
    if (selectedServer) return "detail";
    if (activeTab === "apps") return "apps";
    return "home";
  }, [viewParam, selectedServer, activeTab]);

  return (
    <div className="flex-1 flex min-h-0 min-w-0 overflow-hidden relative">
        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden">
          {currentView === "add" ? (
            <div className="flex-1 overflow-y-auto min-h-0 scrollbar-minimal">
              <div className="w-full max-w-lg px-6 py-5 space-y-3">
                <div>
                  <button
                    onClick={handleBackToApps}
                    className="inline-flex items-center gap-1.5 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  >
                    <ArrowLeft className="size-3.5" />
                    <span>All Apps</span>
                  </button>
                </div>
                <ServerForm
                  mode="add"
                  onSubmit={async (data) => {
                    const result = await onServerAdd(data);
                    const serverId = result?.server?.id;
                    if (serverId) {
                      handleSelectApp(serverId);
                    } else {
                      handleBackToApps();
                    }
                    return result;
                  }}
                  onCancel={handleBackToApps}
                  session={userSession || session}
                />
              </div>
            </div>
          ) : currentView === "edit" && selectedServer ? (
            <div className="flex-1 overflow-y-auto min-h-0 scrollbar-minimal">
              <div className="w-full max-w-lg px-6 py-5 space-y-3">
                <div>
                  <button
                    onClick={() => handleSelectApp(selectedServer.id)}
                    className="inline-flex items-center gap-1.5 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  >
                    <ArrowLeft className="size-3.5" />
                    <span>Back to {selectedServer.name}</span>
                  </button>
                </div>
                <ServerForm
                  mode="edit"
                  server={selectedServer}
                  onSubmit={async (data) => {
                    const result = await onServerUpdate({ id: selectedServer.id, ...data });
                    await refetchUserServers();
                    handleSelectApp(result?.server ?? selectedServer.id);
                    return result;
                  }}
                  onCancel={() => handleSelectApp(selectedServer.id)}
                  session={userSession || session}
                />
              </div>
            </div>
          ) : currentView === "detail" && selectedServer ? (
            <AppDetailView
              server={selectedServer}
              userSession={userSession || session}
              onBack={handleBackToApps}
              onAction={onServerAction}
              onEdit={handleEditApp}
              onDelete={onServerDelete}
              onTestTool={handleTestTool}
            />
          ) : currentView === "apps" ? (
            <AppsView
              userSession={userSession || session}
              onSelectApp={handleSelectApp}
              onAction={onServerAction}
              onDeleteApp={onServerDelete}
              onAddApp={handleAddApp}
            />
          ) : (
            <HomeView
              userSession={userSession || session}
              onSelectApp={handleSelectApp}
              onNavigateToApps={handleNavigateToApps}
              onAction={onServerAction}
              initialUsageData={initialUsageData}
            />
          )}
        </div>

        {/* Tool Execution Panel (slide-over) */}
        {toolTesterOpen && selectedServer && selectedToolName && (
          <>
            {/* Resize handle */}
            <div
              className="w-1 cursor-col-resize hover:bg-primary/20 active:bg-primary/30 transition-colors flex-shrink-0 z-10"
              onMouseDown={startResizing}
            />
            <div
              className="flex flex-col border-l border-border bg-background overflow-hidden flex-shrink-0"
              style={{ width: panelWidth }}
            >
              {/* Panel Header */}
              <div className="h-14 px-4 border-b border-border flex items-center justify-between gap-2 shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                  <ServerIcon
                    serverName={selectedServer.name}
                    serverUrl={selectedServer.url}
                    icon={selectedServer.icon || (selectedServer as any).icon}
                    size={16}
                  />
                  <span className="text-xs font-mono font-medium text-foreground truncate">
                    {selectedToolName}
                  </span>
                </div>
                <SimpleTooltip content="Close" side="bottom">
                  <button
                    onClick={() => { setToolTesterOpen(false); setSelectedToolName(null); }}
                    className="shrink-0 p-1.5 rounded-sm text-muted-foreground hover:text-foreground hover:bg-card transition-colors cursor-pointer"
                    aria-label="Close"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </SimpleTooltip>
              </div>
              <div className="flex-1 overflow-hidden">
                <ToolExecutionPanel
                  server={selectedServer}
                  tools={selectedServer.tools ?? []}
                  initialToolName={selectedToolName}
                />
              </div>
            </div>
          </>
        )}
      </div>
  );
}
