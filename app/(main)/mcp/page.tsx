"use client";
import { Suspense } from "react";
import McpClientLayout from "@/components/mcp-client/McpClientLayout";
import { McpServer } from "@/types/mcp";
import { useAuth } from "@/components/providers/AuthProvider";
import {
  usePublicServers,
  useUserServers,
  useServerActions,
  useConnectionActions,
} from "@/hooks/use-mcp-store-hooks";

function McpPageContent() {
  const { userSession } = useAuth();
  const session = userSession;

  // Get server data from Zustand store
  const {
    servers: publicServers,
    loading: publicLoading,
    error: publicError,
    hasNextPage,
    totalCount: publicServersCount,
    loadMore: loadMorePublicServers,
    refetch: refetchPublicServers,
  } = usePublicServers();

  const {
    servers: userServers,
    loading: userLoading,
    error: userError,
    totalCount: userServersCount,
    refetch: fetchUserServers,
  } = useUserServers();

  // Get actions from Zustand store (toast notifications handled in store)
  const { addServer, updateServer, deleteServer, refreshAllServers } = useServerActions();
  const { connect, disconnect } = useConnectionActions();

  const handleServerAction = async (server: McpServer, action: 'activate' | 'deactivate') => {
    if (action === 'activate') {
      await connect(server);
      return { success: true };
    }

    if (action === 'deactivate') {
      const sessionId = (server as any).sessionId;
      if (sessionId) {
        await disconnect(sessionId);
      }
      return { success: true };
    }
  };

  const handleServerAdd = async (data: Record<string, unknown>) => {
    const newServer = await addServer(data as Partial<McpServer>);
    if (newServer) {
      await refreshAllServers();
    }
  };

  const handleServerUpdate = async (data: Record<string, unknown>) => {
    const { id, ...updates } = data;
    if (!id || typeof id !== 'string') {
      throw new Error('Server ID is required');
    }

    const updatedServer = await updateServer(id, updates as Partial<McpServer>);
    if (updatedServer) {
      await refreshAllServers();
    }
  };

  const handleServerDelete = async (serverId: string) => {
    const success = await deleteServer(serverId);
    if (success) {
      await refreshAllServers();
    }
  };

  const handleUpdatePublicServer = () => {
    refetchPublicServers();
  };

  const handleUpdateUserServer = () => {
    fetchUserServers();
  };

  return (
    <>
      <McpClientLayout
        publicServers={publicServers}
        userServers={userServers}
        publicServersCount={publicServersCount}
        userServersCount={userServersCount}
        publicLoading={publicLoading}
        userLoading={userLoading}
        publicError={publicError}
        userError={userError}
        session={session}
        userSession={userSession}
        onRefreshPublic={refetchPublicServers}
        onRefreshUser={fetchUserServers}
        onServerAction={handleServerAction}
        onServerAdd={handleServerAdd}
        onServerUpdate={handleServerUpdate}
        onServerDelete={handleServerDelete}
        onUpdatePublicServer={handleUpdatePublicServer}
        onUpdateUserServer={handleUpdateUserServer}
        hasNextPage={hasNextPage}
        isLoadingMore={false}
        onLoadMore={loadMorePublicServers}
      />
    </>
  );
}

export default function McpPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <McpPageContent />
    </Suspense>
  );
}
