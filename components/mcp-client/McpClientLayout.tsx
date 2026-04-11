"use client";

import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { PanelLeftOpen } from "lucide-react";
import { Toaster } from "react-hot-toast";
import { Session } from "@supabase/supabase-js";
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

interface McpClientLayoutProps {
  publicServers: McpServer[] | null;
  userServers: McpServer[] | null;
  publicServersCount?: number;
  userServersCount?: number;
  publicLoading: boolean;
  userLoading: boolean;
  publicError: string | null;
  userError: string | null;
  session: Session | null;
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
  };

  const handleEditServer = (server: McpServer) => {
    setViewMode('edit');
    setEditingServer(server);
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

      <div className="flex h-full">
        {/* Left Sidebar */}
        <AnimatePresence>
          {sidebarOpen && (
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
              onClose={() => setSidebarOpen(false)}
              hasNextPage={hasNextPage}
              isLoadingMore={isLoadingMore}
              onLoadMore={onLoadMore}
              activeTab={activeTab}
              onTabChange={setActiveTab}
              selectedCategory={selectedCategory}
              onCategoryChange={handleCategorySelect}
              session={session}
              userSession={userSession}
            />
          )}
        </AnimatePresence>

        {/* Main Content Area with Right Panel */}
        <motion.div
          initial="hidden"
          animate="visible"
          variants={mainVariants}
          transition={{ duration: 0.3, ease: "easeOut", delay: 0.1 }}
          className={`flex-1 flex transition-all duration-300 ${sidebarOpen ? 'ml-0 lg:ml-80' : 'ml-0'}`}
        >
          {/* Left Side - Main Content - Hidden when tool tester is open */}
          {!toolTesterOpen && (
            <div className="flex-1 flex flex-col min-w-0">
              {/* Show Sidebar Button - Only when sidebar is closed */}
              {!sidebarOpen && (
                <div className="sticky top-0 z-[70] border-b border-border bg-background/90 p-4 backdrop-blur">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSidebarOpen(true)}
                    className="flex items-center gap-2"
                  >
                    <PanelLeftOpen className="h-4 w-4" />
                    Show Servers
                  </Button>
                </div>
              )}

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
                  <ServerPlaceholder type="no-selection" />
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
                className="flex-1"
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
