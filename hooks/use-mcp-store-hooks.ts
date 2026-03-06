import {
  useMcpStore,
  selectActiveConnections,
  selectIsLoading,
  findConnectionForServer,
  type McpStore
} from '@/lib/stores/mcp-store';
import { useEffect, useMemo, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';

/**
 * Hook: Get public servers with connection state
 * Automatically fetches on mount
 */
export function usePublicServers() {
  const fetchPublicServers = useMcpStore((state: McpStore) => state.fetchPublicServers);
  const loadMore = useMcpStore((state: McpStore) => state.loadMorePublicServers);
  const hasAttemptedInitialFetch = useRef(false);

  // Use shallow comparison to prevent unnecessary re-renders
  const { publicServers, connections, activeTab } = useMcpStore(
    useShallow((state: McpStore) => ({
      publicServers: state.publicServers,
      connections: state.connections,
      activeTab: state.activeTab,
    }))
  );

  const loading = useMcpStore((state: McpStore) => state.publicServersLoading);
  const error = useMcpStore((state: McpStore) => state.publicServersError);
  const hasNextPage = useMcpStore((state: McpStore) => state.publicServersHasNext);
  const totalCount = useMcpStore((state: McpStore) => state.publicServersTotalCount);

  // Memoize servers with connection state
  const servers = useMemo(() => {
    return publicServers.map((server) => {
      const connection = findConnectionForServer(connections, server);

      return {
        ...server,
        connectionStatus: connection?.connectionStatus || 'DISCONNECTED',
        sessionId: connection?.sessionId,
        tools: connection?.tools || server.tools || [],
      };
    });
  }, [publicServers, connections]);

  useEffect(() => {
    // Run only one automatic initial fetch. Avoid infinite retries on persistent API errors.
    if (hasAttemptedInitialFetch.current) return;

    if (servers.length > 0) {
      hasAttemptedInitialFetch.current = true;
      return;
    }

    if (servers.length === 0 && !loading && !error) {
      hasAttemptedInitialFetch.current = true;
      void fetchPublicServers();
    }
  }, [fetchPublicServers, servers.length, loading, error]);

  return {
    servers,
    loading,
    error,
    hasNextPage,
    totalCount,
    loadMore,
    refetch: fetchPublicServers,
  };
}

/**
 * Hook: Get user servers with connection state
 */
export function useUserServers() {
  // Use shallow comparison to prevent unnecessary re-renders
  const { userServers, connections } = useMcpStore(
    useShallow((state: McpStore) => ({
      userServers: state.userServers,
      connections: state.connections,
    }))
  );

  const loading = useMcpStore((state: McpStore) => state.userServersLoading);
  const error = useMcpStore((state: McpStore) => state.userServersError);
  const totalCount = useMcpStore((state: McpStore) => state.userServersTotalCount);
  const refetch = useMcpStore((state: McpStore) => state.fetchUserServers);

  // Memoize servers with connection state
  const servers = useMemo(() => {
    return userServers.map((server) => {
      const connection = findConnectionForServer(connections, server);
      return {
        ...server,
        connectionStatus: connection?.connectionStatus || 'DISCONNECTED',
        sessionId: connection?.sessionId,
        tools: connection?.tools || server.tools || [],
      };
    });
  }, [userServers, connections]);

  return {
    servers,
    loading,
    error,
    totalCount,
    refetch,
  };
}

/**
 * Hook: Get filtered servers based on search and category
 */
export function useFilteredServers() {
  // Use shallow comparison to prevent unnecessary re-renders
  const { publicServers, userServers, connections, searchQuery, selectedCategory, activeTab } = useMcpStore(
    useShallow((state: McpStore) => ({
      publicServers: state.publicServers,
      userServers: state.userServers,
      connections: state.connections,
      searchQuery: state.searchQuery,
      selectedCategory: state.selectedCategory,
      activeTab: state.activeTab,
    }))
  );

  const loading = useMcpStore((state: McpStore) =>
    state.activeTab === 'public' ? state.publicServersLoading : state.userServersLoading
  );
  const error = useMcpStore((state: McpStore) =>
    state.activeTab === 'public' ? state.publicServersError : state.userServersError
  );

  // Memoize filtered servers
  const servers = useMemo(() => {
    // Get base servers with connection state
    const baseServers = activeTab === 'public' ? publicServers : userServers;
    let serversWithConnections = baseServers.map((server) => {
      const connection = findConnectionForServer(connections, server);

      return {
        ...server,
        connectionStatus: connection?.connectionStatus || 'DISCONNECTED',
        sessionId: connection?.sessionId,
        tools: connection?.tools || server.tools || [],
      };
    });

    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      serversWithConnections = serversWithConnections.filter(
        (s) =>
          s.name.toLowerCase().includes(query) ||
          s.description?.toLowerCase().includes(query)
      );
    }

    // Apply category filter
    if (selectedCategory) {
      serversWithConnections = serversWithConnections.filter((s) =>
        s.categories?.some((c) => c.slug === selectedCategory)
      );
    }

    return serversWithConnections;
  }, [publicServers, userServers, connections, searchQuery, selectedCategory, activeTab]);

  return { servers, loading, error };
}

/**
 * Hook: Get all active connections
 */
export function useActiveConnections() {
  const connections = useMcpStore(selectActiveConnections);
  const loading = useMcpStore((state: McpStore) => state.connectionsLoading);
  const activeCount = useMcpStore((state: McpStore) => state.activeConnectionCount);

  return { connections, loading, activeCount };
}

/**
 * Hook: Server CRUD operations
 */
export function useServerActions() {
  const addServer = useMcpStore((state: McpStore) => state.addServer);
  const updateServer = useMcpStore((state: McpStore) => state.updateServer);
  const deleteServer = useMcpStore((state: McpStore) => state.deleteServer);
  const fetchUserServers = useMcpStore((state: McpStore) => state.fetchUserServers);
  const fetchPublicServers = useMcpStore((state: McpStore) => state.fetchPublicServers);

  /**
   * Refresh all server lists
   */
  const refreshAllServers = async () => {
    await Promise.all([fetchUserServers(), fetchPublicServers()]);
  };

  return {
    addServer,
    updateServer,
    deleteServer,
    refreshAllServers,
  };
}

/**
 * Hook: Connection operations
 */
export function useConnectionActions() {
  const connect = useMcpStore((state: McpStore) => state.connect);
  const disconnect = useMcpStore((state: McpStore) => state.disconnect);
  const getConnection = useMcpStore((state: McpStore) => state.getConnection);
  const getConnectionStatus = useMcpStore((state: McpStore) => state.getConnectionStatus);
  const isServerConnected = useMcpStore((state: McpStore) => state.isServerConnected);
  const getServerTools = useMcpStore((state: McpStore) => state.getServerTools);

  return {
    connect,
    disconnect,
    getConnection,
    getConnectionStatus,
    isServerConnected,
    getServerTools,
  };
}

/**
 * Hook: UI state management
 */
export function useUIState() {
  const searchQuery = useMcpStore((state: McpStore) => state.searchQuery);
  const selectedCategory = useMcpStore((state: McpStore) => state.selectedCategory);
  const activeTab = useMcpStore((state: McpStore) => state.activeTab);
  const selectedServer = useMcpStore((state: McpStore) => state.selectedServer);
  const viewMode = useMcpStore((state: McpStore) => state.viewMode);
  const editingServer = useMcpStore((state: McpStore) => state.editingServer);
  const toolTesterOpen = useMcpStore((state: McpStore) => state.toolTesterOpen);
  const selectedToolName = useMcpStore((state: McpStore) => state.selectedToolName);
  const deleteDialogOpen = useMcpStore((state: McpStore) => state.deleteDialogOpen);
  const serverToDelete = useMcpStore((state: McpStore) => state.serverToDelete);
  const sidebarOpen = useMcpStore((state: McpStore) => state.sidebarOpen);

  const setSearchQuery = useMcpStore((state: McpStore) => state.setSearchQuery);
  const setSelectedCategory = useMcpStore((state: McpStore) => state.setSelectedCategory);
  const setActiveTab = useMcpStore((state: McpStore) => state.setActiveTab);
  const setSelectedServer = useMcpStore((state: McpStore) => state.setSelectedServer);
  const setViewMode = useMcpStore((state: McpStore) => state.setViewMode);
  const setEditingServer = useMcpStore((state: McpStore) => state.setEditingServer);
  const openToolTester = useMcpStore((state: McpStore) => state.openToolTester);
  const closeToolTester = useMcpStore((state: McpStore) => state.closeToolTester);
  const openDeleteDialog = useMcpStore((state: McpStore) => state.openDeleteDialog);
  const closeDeleteDialog = useMcpStore((state: McpStore) => state.closeDeleteDialog);
  const toggleSidebar = useMcpStore((state: McpStore) => state.toggleSidebar);
  const resetUIState = useMcpStore((state: McpStore) => state.resetUIState);

  return {
    // State
    searchQuery,
    selectedCategory,
    activeTab,
    selectedServer,
    viewMode,
    editingServer,
    toolTesterOpen,
    selectedToolName,
    deleteDialogOpen,
    serverToDelete,
    sidebarOpen,

    // Actions
    setSearchQuery,
    setSelectedCategory,
    setActiveTab,
    setSelectedServer,
    setViewMode,
    setEditingServer,
    openToolTester,
    closeToolTester,
    openDeleteDialog,
    closeDeleteDialog,
    toggleSidebar,
    resetUIState,
  };
}

/**
 * Hook: Registry servers
 */
export function useRegistryServers() {
  const servers = useMcpStore((state: McpStore) => state.registryServers);
  const loading = useMcpStore((state: McpStore) => state.registryLoading);
  const error = useMcpStore((state: McpStore) => state.registryError);
  const hasNextPage = useMcpStore((state: McpStore) => !!state.registryNextCursor);
  const hasPreviousPage = useMcpStore((state: McpStore) => state.registryCursorHistory.length > 0);

  const fetchServers = useMcpStore((state: McpStore) => state.fetchRegistryServers);
  const goToNext = useMcpStore((state: McpStore) => state.goToNextRegistryPage);
  const goToPrevious = useMcpStore((state: McpStore) => state.goToPreviousRegistryPage);
  const searchQuery = useMcpStore((state: McpStore) => state.searchQuery);

  useEffect(() => {
    // Fetch on mount or when search changes
    if (servers.length === 0 && !loading) {
      fetchServers(searchQuery);
    }
  }, [fetchServers, searchQuery, servers.length, loading]);

  return {
    servers,
    loading,
    error,
    hasNextPage,
    hasPreviousPage,
    goToNext,
    goToPrevious,
    refetch: () => fetchServers(searchQuery),
  };
}

/**
 * Hook: Overall loading state
 */
export function useGlobalLoading() {
  return useMcpStore(selectIsLoading);
}
