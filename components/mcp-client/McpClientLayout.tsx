"use client";

import { useState, useMemo, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { ArrowLeft, X } from "lucide-react";
import { Toaster, toast } from "react-hot-toast";

import { HomeView } from "./HomeView";
import { AppsView } from "./AppsView";
import { AppDetailView } from "./AppDetailView";
import { ServerIcon } from "@/components/common/ServerIcon";
import { McpServer } from "@/types/mcp";
import { useMcpStore, type StoredConnection } from "@/lib/stores/mcp-store";
import { useMcpConnection } from "@/hooks/useMcpConnection";
import { UserSession } from "@/components/providers/AuthProvider";
import { usePublicServers } from "@/hooks/usePublicServers";
import ServerForm from "./ServerForm";

const ToolExecutionPanel = dynamic(() => import("./ToolExecutionPanel"), {
  ssr: false,
});

interface McpClientLayoutProps {
  session: UserSession | null;
  userSession?: UserSession | null;
  onServerAdd: (data: Record<string, unknown>) => Promise<void>;
  onServerUpdate: (data: Record<string, unknown>) => Promise<void>;
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
  const connections = useMcpStore((s) => s.connections);

  // Only fetch the default page size — no need to over-fetch for resolution
  const { servers: catalogServers } = usePublicServers();

  const activeTabParam = searchParams.get("tab");
  const serverParam = searchParams.get("server");

  /**
   * Resolve the selected server for AppDetailView.
   *
   * Priority:
   *  1. Loaded catalog page (mcp_servers) — match by id
   *  2. Active runtime connections with metadata.catalogServerId — reliable DB-persisted link
   *  3. Active runtime connections by sessionId (fallback for non-catalog servers)
   *  4. SSR-provided initialSelectedServer
   */
  const selectedServer = useMemo((): McpServer | null => {
    if (!serverParam) return null;

    // 1. Check loaded catalog servers by their UUID primary key
    const fromCatalog = catalogServers.find((s) => s.id === serverParam);
    if (fromCatalog) return fromCatalog;

    // 2 & 3. Check active connections — prefer metadata.catalogServerId match,
    // fall back to sessionId (used for custom/non-catalog servers)
    const conn: StoredConnection | undefined =
      connections[serverParam] ??
      Object.values(connections).find(
        (c) => c.metadata?.catalogServerId === serverParam
      );

    if (conn) {
      // If the connection has a catalogServerId, try to fetch the full catalog entry.
      // For now build from connection data — AppDetailView will enrich from the store.
      return {
        id: conn.metadata?.catalogServerId ?? conn.serverId,
        name: conn.serverName,
        url: conn.url ?? undefined,
        transport: conn.transport ?? "streamable-http",
        tools: conn.tools ?? [],
        connectionStatus: conn.connectionStatus,
        isPublic: true,
        requiresOauth2: false,
        description: "",
        updated_at: conn.connectedAt ?? new Date().toISOString(),
      };
    }

    // 4. SSR fallback
    return initialSelectedServer ?? null;
  }, [serverParam, catalogServers, connections, initialSelectedServer]);

  // Handle navigating to an App detail
  const handleSelectApp = useCallback(
    (app: McpServer) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", "apps");
      params.set("server", app.id);
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams]
  );

  // Handle returning back to Apps catalog
  const handleBackToApps = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("server");
    params.delete("view");
    params.set("tab", "apps");
    setToolTesterOpen(false);
    setSelectedToolName(null);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }, [router, pathname, searchParams]);

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

  // Determine active view
  const viewParam = searchParams.get("view");
  const currentView = useMemo(() => {
    if (viewParam === "add") return "add";
    if (selectedServer) return "detail";
    if (activeTabParam === "apps") return "apps";
    return "home";
  }, [viewParam, selectedServer, activeTabParam]);

  const activeNav = activeTabParam === "apps" || selectedServer || viewParam === "add" ? "apps" : "home";
  const titleBreadcrumb =
    currentView === "add"
      ? "Apps > Add New App"
      : currentView === "detail" && selectedServer
      ? `Apps > ${selectedServer.name}`
      : currentView === "apps"
      ? "Apps"
      : "Home";

  return (
    <>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 3000,
          style: {
            background: "#383330",
            color: "#f7f5f0",
            border: "1px solid #3f3a36",
            borderRadius: "4px",
            fontSize: "13px",
            fontFamily: "var(--font-inter), sans-serif",
          },
        }}
      />

      <div className="flex-1 flex min-h-0 min-w-0 overflow-hidden relative">
        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden">
          {currentView === "add" ? (
            <div className="flex-1 overflow-y-auto min-h-0 scrollbar-minimal">
              <div className="w-full max-w-xl px-6 sm:px-8 py-8">
                <div className="mb-4">
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
                    await onServerAdd(data);
                    toast.success("App added successfully");
                    handleBackToApps();
                  }}
                  onCancel={handleBackToApps}
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
              onTestTool={handleTestTool}
            />
          ) : currentView === "apps" ? (
            <AppsView
              userSession={userSession || session}
              onSelectApp={handleSelectApp}
              onAction={onServerAction}
              onAddApp={handleAddApp}
            />
          ) : (
            <HomeView
            userSession={userSession || session}
            onSelectApp={handleSelectApp}
            onNavigateToApps={() => {
              const params = new URLSearchParams(searchParams.toString());
              params.set("tab", "apps");
              router.push(`${pathname}?${params.toString()}`, { scroll: false });
            }}
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
                  <ServerIcon serverName={selectedServer.name} serverUrl={selectedServer.url} size={16} />
                  <span className="text-xs font-mono font-medium text-foreground truncate">
                    {selectedToolName}
                  </span>
                </div>
                <button
                  onClick={() => { setToolTesterOpen(false); setSelectedToolName(null); }}
                  className="shrink-0 p-1.5 rounded-sm text-muted-foreground hover:text-foreground hover:bg-card transition-colors cursor-pointer"
                  aria-label="Close"
                  title="Close"
                >
                  <X className="h-4 w-4" />
                </button>
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
    </>
  );
}
