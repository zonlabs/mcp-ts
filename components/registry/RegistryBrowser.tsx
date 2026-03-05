"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, AlertCircle, Package, ChevronLeft, ChevronRight, X, Loader2, ChevronRight as ChevronRightIcon } from "lucide-react";
import { motion } from "framer-motion";
import { useRegistryServers } from "@/hooks/useRegistryServers";
import { RegistryServerCard } from "./RegistryServerCard";
import { ServerDetail } from "./ServerDetail";
import type { ParsedRegistryServer } from "@/types/mcp";
import { useState, useCallback, useEffect, useMemo } from "react";
import { useOAuthCallback } from "@/hooks/useOAuthCallback";
import {
  useMcpStore,
  findConnectionForServer,
  type McpStore
} from "@/lib/stores/mcp-store";
import { useMcpConnection } from "@/hooks/useMcpConnection";

export function RegistryBrowser() {
  const activeCount = useMcpStore((state: McpStore) => state.activeConnectionCount);
  const connections = useMcpStore((state: McpStore) => state.connections);
  const { mergeWithStoredState } = useMcpConnection();
  const {
    servers: rawServers,
    loading,
    error,
    hasNextPage,
    hasPreviousPage,
    goToNextPage,
    goToPreviousPage,
    searchQuery,
    setSearchQuery,
    debouncedSearch,
    refetch,
  } = useRegistryServers();

  // Merge connection state into server list using the shared utility
  const servers = useMemo(() =>
    rawServers ? mergeWithStoredState(rawServers) : rawServers,
    [rawServers, mergeWithStoredState]
  );

  const [paginationAction, setPaginationAction] = useState<'prev' | 'next' | null>(null);
  const [selectedServer, setSelectedServer] = useState<ParsedRegistryServer | null>(null);

  // Handle OAuth callback redirect using shared hook
  // Store will trigger reactive updates automatically, no refetch needed
  useOAuthCallback();

  const handleClearSearch = () => {
    setSearchQuery("");
  };

  const handlePreviousPage = useCallback(() => {
    setPaginationAction('prev');
    goToPreviousPage();
  }, [goToPreviousPage]);

  const handleNextPage = useCallback(() => {
    setPaginationAction('next');
    goToNextPage();
  }, [goToNextPage]);

  const handleViewDetails = (server: ParsedRegistryServer) => {
    setSelectedServer(server);
  };

  const handleBackToRegistry = () => {
    setSelectedServer(null);
  };

  // Clear pagination action when loading completes
  useEffect(() => {
    if (!loading) {
      setPaginationAction(null);
    }
  }, [loading]);

  // If a server is selected, show detail view
  if (selectedServer) {
    // Merge latest connection status into selected server to ensure reactivity
    const storedConnection = findConnectionForServer(connections, {
      id: selectedServer.id,
      url: selectedServer.remoteUrl,
    });
    const serverWithLatestStatus = storedConnection ? {
      ...selectedServer,
      connectionStatus: storedConnection.connectionStatus,
      tools: storedConnection.tools || selectedServer.tools || [],
    } : selectedServer;

    return (
      <div className="min-h-screen">
        <div className="container mx-auto px-4 py-8 max-w-7xl">
          {/* Breadcrumb Navigation */}
          <div className="flex items-center gap-2 text-sm mb-8">
            <button
              onClick={handleBackToRegistry}
              className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
            >
              <Package className="h-4 w-4" />
              <span>Registry</span>
            </button>
            <ChevronRightIcon className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium text-foreground">
              {serverWithLatestStatus.title || serverWithLatestStatus.name}
            </span>
          </div>

          {/* Server Detail */}
          <ServerDetail server={serverWithLatestStatus} />
        </div>
      </div>
    );
  }

  // Otherwise, show the registry grid
  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <div className="border-b border-border/50 bg-gradient-to-br from-background via-primary/5 to-background">
        <div className="container mx-auto px-4 py-8 max-w-7xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="flex flex-col items-center text-center space-y-4"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
            >
              <Package className="h-10 w-10 text-primary" />
            </motion.div>
            <motion.h1
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-primary via-blue-500 to-primary/60 bg-clip-text text-transparent"
            >
              MCP Registry
            </motion.h1>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="text-lg text-muted-foreground max-w-2xl"
            >
              Discover and explore Model Context Protocol servers from the official registry
            </motion.p>

            {/* Search Bar */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="w-full max-w-2xl mt-8"
            >
              <div className="relative">
                <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground z-10" />
                <Input
                  placeholder="Search servers by name, description, or vendor..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-12 pr-12 h-14 text-base bg-background/80 backdrop-blur-md border-border/50 focus:border-primary/50 shadow-lg focus:ring-2 focus:ring-primary/20 transition-all"
                />
                {searchQuery && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleClearSearch}
                    className="absolute right-2 top-1/2 transform -translate-y-1/2 h-10 w-10 z-10 hover:bg-muted"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </motion.div>

            {/* Stats */}
            <div className="flex items-center gap-6 text-sm text-muted-foreground pt-4">
              {!loading && !error && debouncedSearch && (
                <div className="flex items-center gap-2">
                  <Search className="h-3 w-3" />
                  <span>Search: "{debouncedSearch}"</span>
                </div>
              )}
              {activeCount > 0 && (
                <div className="flex items-center gap-1.5 bg-green-100 dark:bg-green-900/30 px-3 py-1 rounded-full">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                  <span className="text-xs font-medium text-green-700 dark:text-green-400">
                    {activeCount} active connection{activeCount !== 1 ? 's' : ''}
                  </span>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      </div>

      {/* Content Section */}
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Header Actions */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold text-foreground">
              {debouncedSearch ? "Search Results" : "All Servers"}
            </h2>
            {activeCount > 0 && (
              <div className="flex items-center gap-1.5 bg-green-100 dark:bg-green-900/30 px-2.5 py-1 rounded-full">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                <span className="text-xs font-medium text-green-700 dark:text-green-400">
                  {activeCount} active
                </span>
              </div>
            )}
          </div>

          {/* Pagination Controls */}
          {(hasNextPage || hasPreviousPage) && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePreviousPage}
                disabled={!hasPreviousPage || loading}
                className="gap-2"
              >
                {loading && paginationAction === 'prev' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ChevronLeft className="h-4 w-4" />
                )}
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleNextPage}
                disabled={!hasNextPage || loading}
                className="gap-2"
              >
                Next
                {loading && paginationAction === 'next' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </Button>
            </div>
          )}
        </div>

        {/* Error Alert */}
        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Loading State */}
        {loading && servers.length === 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, idx) => (
              <Skeleton key={idx} className="h-64 w-full rounded-lg" />
            ))}
          </div>
        )}

        {/* Server Grid */}
        {servers.length > 0 && (
          <>
            <motion.div
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
              initial="hidden"
              animate="visible"
              variants={{
                visible: {
                  transition: {
                    staggerChildren: 0.05,
                  },
                },
              }}
            >
              {servers.map((server, index) => (
                <motion.div
                  key={server.id}
                  variants={{
                    hidden: { opacity: 0, y: 20 },
                    visible: { opacity: 1, y: 0 },
                  }}
                  transition={{ duration: 0.3 }}
                >
                  <RegistryServerCard
                    server={server}
                    onViewDetails={handleViewDetails}
                  />
                </motion.div>
              ))}
            </motion.div>
          </>
        )}

        {/* Empty State */}
        {!loading && servers.length === 0 && !error && (
          <div className="text-center py-20">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-muted/50 mb-6">
              <Search className="h-10 w-10 text-muted-foreground" />
            </div>
            <h3 className="text-2xl font-semibold mb-2">No servers found</h3>
            <p className="text-muted-foreground max-w-md mx-auto mb-6">
              {debouncedSearch
                ? `No servers match your search "${debouncedSearch}". Try adjusting your search query.`
                : "No servers available in the registry at the moment."}
            </p>
            {debouncedSearch && (
              <Button onClick={handleClearSearch} variant="outline">
                Clear Search
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
