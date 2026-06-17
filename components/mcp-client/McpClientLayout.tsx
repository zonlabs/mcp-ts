"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { PanelLeftOpen } from "lucide-react";
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
import { McpServer } from "@/types/mcp";
import ServerForm from "./ServerForm";
import { ServerSidebar } from "./ServerSidebar";
import { ServerDetails } from "./ServerDetails";
import { ServerPlaceholder } from "./ServerPlaceholder";
import ToolsExplorer from "./ToolsExplorer";
import ToolExecutionPanel from "./ToolExecutionPanel";
import { useMcpStore, type McpStore } from "@/lib/stores/mcp-store";
import { useMcpConnection } from "@/hooks/useMcpConnection";
import { UserSession } from "@/components/providers/AuthProvider";
import RemoteMcpPanel from "@/components/remote-mcp/RemoteMcpPanel";

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
  onLoadMore
}: McpClientLayoutProps) {
  const [selectedServer, setSelectedServer] = useState<McpServer | null>(null);
  const [toolTesterOpen, setToolTesterOpen] = useState(false);
  const [selectedToolName, setSelectedToolName] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [remoteMcpOpen, setRemoteMcpOpen] = useState(false);

  const [remoteMcpData, setRemoteMcpData] = useState<any | null>(null);
  const [remoteMcpLoading, setRemoteMcpLoading] = useState(true);
  const [remoteMcpError, setRemoteMcpError] = useState<string | null>(null);

  const fetchRemoteMcpData = useCallback(async (page: number) => {
    setRemoteMcpLoading(true);
    try {
      const res = await fetch(`/api/remote-mcp/usage?page=${page}`);
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || "Failed to load remote MCP details");
      }
      const json = await res.json();
      setRemoteMcpData(json);
      setRemoteMcpError(null);
    } catch (err) {
      setRemoteMcpError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setRemoteMcpLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRemoteMcpData(1);
  }, [fetchRemoteMcpData]);

  // View State Management
  const [viewMode, setViewMode] = useState<'browse' | 'add' | 'edit'>('browse');
  const [editingServer, setEditingServer] = useState<McpServer | null>(null);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [serverToDelete, setServerToDelete] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'public' | 'user'>('public');

  const activeServersCount = useMcpStore((state: McpStore) => state.activeConnectionCount);
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

  useEffect(() => {
    const val = searchParams.get("remote-mcp");
    if (val === "true" || val === "activity" || val === "revoke") {
      handleOpenRemoteMcp();
    }
  }, [searchParams]);

  const handleOpenRemoteMcp = () => {
    setRemoteMcpOpen(true);
    setToolTesterOpen(false);
    setSelectedServer(null);
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

  // Update selected server when servers list changes
  useEffect(() => {
    if (selectedServer) {
      const updatedServer = currentServers?.find(server => server.name === selectedServer.name);

      if (updatedServer) {
        setSelectedServer(updatedServer);
      } else {
        const storedConnection =
          getConnectionByServerId(selectedServer.id) ||
          (selectedServer.url ? getConnectionByServerId(selectedServer.url) : undefined);
        if (storedConnection) {
          setSelectedServer(prev => prev ? ({
            ...prev,
            connectionStatus: storedConnection.connectionStatus,
            tools: storedConnection.tools || [],
            transport: storedConnection.transport || prev.transport,
            url: storedConnection.url || prev.url,
          }) : null);
        } else {
          setSelectedServer(prev => prev ? ({
            ...prev,
            connectionStatus: 'DISCONNECTED',
            tools: [],
          }) : null);
        }
      }
    }
  }, [currentServers, selectedServer?.name]);

  // Close tool tester when server selection changes
  useEffect(() => {
    setToolTesterOpen(false);
    setSelectedToolName(null);
  }, [selectedServer?.id]);

  const handleAddServer = () => {
    setViewMode('add');
    setSelectedServer(null); // Deselect to show form clearly? Or keep selection? 
    setEditingServer(null);
    setRemoteMcpOpen(false);
  };

  const handleEditServer = (server: McpServer) => {
    setViewMode('edit');
    setEditingServer(server);
    setRemoteMcpOpen(false);
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
        setSelectedServer(null);
        setViewMode('browse');
      }
      setDeleteDialogOpen(false);
      setServerToDelete(null);
    } catch (error) {
      // Error handled by toast notification
    }
  };

  const handleFormSubmit = async (data: Record<string, unknown>) => {
    if (viewMode === 'add') {
      await onServerAdd(data);
    } else {
      await onServerUpdate(data);
    }
    setViewMode('browse');
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

  const handleServerSelect = (server: McpServer) => {
    setSelectedServer(server);
    setViewMode('browse'); // Switch back to details view if selecting a server
    setRemoteMcpOpen(false);
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches) {
      setSidebarOpen(false);
    }
  };

  const mainVariants = {
    hidden: { opacity: 0, x: 20 },
    visible: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: 20 }
  };

  return (
    <div className="min-h-screen bg-background">
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

      {/* Mobile Sidebar Toggle Header */}
      {!sidebarOpen && (
        <div className="sticky top-16 z-[70] border-b border-border bg-background/90 p-3 backdrop-blur lg:hidden flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSidebarOpen(true)}
            className="flex items-center gap-2 cursor-pointer"
          >
            <PanelLeftOpen className="h-4 w-4" />
            Show Servers
          </Button>
          <span className="text-xs font-semibold text-muted-foreground mr-2">
            {remoteMcpOpen ? "Remote MCP" : toolTesterOpen ? "Tool Execution" : "Servers"}
          </span>
        </div>
      )}

      <div className="flex h-full relative">
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
          sidebarOpen={sidebarOpen}
        />

        {/* Backdrop for Mobile */}
        <AnimatePresence>
          {sidebarOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.4 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-black z-[75] lg:hidden cursor-pointer"
              onClick={() => setSidebarOpen(false)}
            />
          )}
        </AnimatePresence>

        {/* Main Content Area with Right Panel */}
        <motion.div
          initial="hidden"
          animate="visible"
          variants={mainVariants}
          transition={{ duration: 0.3, ease: "easeOut", delay: 0.1 }}
          className="flex-1 flex transition-all duration-300 min-w-0"
        >
          {/* Left Side - Main Content - Hidden when tool tester or remote MCP is open */}
          {!toolTesterOpen && !remoteMcpOpen && (
            <div className="flex-1 flex flex-col min-w-0">
              <AnimatePresence mode="wait">
                {viewMode === 'add' ? (
                  <motion.div
                    key="add-form"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="flex-1 h-full"
                  >
                    <ServerForm
                      mode="add"
                      session={session}
                      onSubmit={handleFormSubmit}
                      onCancel={() => setViewMode('browse')}
                    />
                  </motion.div>
                ) : viewMode === 'edit' && editingServer ? (
                  <motion.div
                    key="edit-form"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="flex-1 h-full"
                  >
                    <ServerForm
                      mode="edit"
                      server={editingServer}
                      session={session}
                      onSubmit={handleFormSubmit}
                      onCancel={() => setViewMode('browse')}
                    />
                  </motion.div>
                ) : selectedServer ? (
                  <motion.div
                    key={selectedServer.name}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ duration: 0.3 }}
                    className="flex-1 flex flex-col"
                  >
                    {/* Server Header & Details */}
                    <ServerDetails
                      server={selectedServer}
                      session={session}
                      userSession={userSession}
                      onAction={onServerAction}
                      onEdit={handleEditServer}
                      onDelete={handleDeleteServer}
                    />

                    {/* Tools Explorer */}
                    <div className="flex-1 overflow-y-auto">
                      <ToolsExplorer
                        server={selectedServer}
                        onOpenToolTester={(toolName) => {
                          setToolTesterOpen(true);
                          if (toolName) {
                            setSelectedToolName(toolName);
                          }
                        }}
                      />
                    </div>
                  </motion.div>
                ) : (
                  <ServerPlaceholder
                    type="no-selection"
                    featuredServers={featuredServers ?? []}
                  />
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Right Panel - Tool Execution - Full width when visible */}
          <AnimatePresence>
            {toolTesterOpen && selectedServer && (
              <motion.div
                initial={{ opacity: 0, x: 320 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 320 }}
                transition={{ duration: 0.3 }}
                className="flex-1 max-w-4xl mx-auto w-full"
              >
                <ToolExecutionPanel
                  server={selectedServer}
                  tools={Array.isArray(selectedServer.tools) ? selectedServer.tools : []}
                  onClose={() => {
                    setToolTesterOpen(false);
                    setSelectedToolName(null);
                  }}
                  initialToolName={selectedToolName}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Right Panel - Remote MCP - Full width when visible */}
          <AnimatePresence>
            {remoteMcpOpen && (
              <motion.div
                initial={{ opacity: 0, x: 320 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 320 }}
                transition={{ duration: 0.3 }}
                className="flex-1 max-w-4xl mx-auto w-full"
              >
                <RemoteMcpPanel
                  data={remoteMcpData}
                  loading={remoteMcpLoading}
                  error={remoteMcpError}
                  onPageChange={fetchRemoteMcpData}
                  initialTab={searchParams.get("remote-mcp") === "revoke" ? "revoke" : "activity"}
                  onClose={() => {
                    setRemoteMcpOpen(false);
                    // Remove remote-mcp query parameter from URL
                    const params = new URLSearchParams(searchParams.toString());
                    if (params.get("remote-mcp")) {
                      params.delete("remote-mcp");
                      const qs = params.toString();
                      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
                    }
                  }}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
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
