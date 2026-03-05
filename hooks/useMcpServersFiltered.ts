"use client";

import { useState, useCallback, useMemo } from "react";
import { useQuery } from "@apollo/client/react";
import { gql } from "@apollo/client";
import { McpServer, Category } from "@/types/mcp";
import { MCP_SERVERS_QUERY } from "@/lib/graphql";
import { useMcpStore, findConnectionForServer, type McpStore } from "@/lib/stores/mcp-store";

const GET_MCP_SERVERS = gql`${MCP_SERVERS_QUERY}`;

interface FilterOptions {
  searchQuery?: string;
  categorySlug?: string;
  categories: Category[];
}

/**
 * Custom hook for filtered MCP servers with pagination
 * Handles search and category filtering using GraphQL
 */
export function useMcpServersFiltered(
  options: FilterOptions,
  first: number = 10
) {
  const { searchQuery, categorySlug, categories } = options;
  const connections = useMcpStore((state: McpStore) => state.connections);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Build GraphQL filter variables
  const buildFilterVariables = useCallback(() => {
    const filters: Record<string, unknown> = {};

    if (searchQuery?.trim()) {
      filters.name = {
        iContains: searchQuery.trim(),
      };
    }

    if (categorySlug) {
      const category = categories.find((cat) => cat.slug === categorySlug);
      if (category?.id) {
        filters.categories = {
          id: {
            exact: category.id,
          },
        };
      }
    }

    return Object.keys(filters).length > 0 ? filters : undefined;
  }, [searchQuery, categorySlug, categories]);

  const isFiltering = Boolean(searchQuery?.trim() || categorySlug);

  const { data, loading, error, fetchMore } = useQuery<{
    mcpServers: {
      edges: Array<{ node: McpServer; cursor: string }>;
      pageInfo: {
        hasNextPage: boolean;
        endCursor: string | null;
      };
      totalCount: number;
    };
  }>(GET_MCP_SERVERS, {
    variables: {
      first,
      filters: buildFilterVariables(),
    },
    skip: !isFiltering,
    fetchPolicy: "cache-and-network",
  });

  // Merge with connection state from store
  const mergeWithConnectionState = useCallback((servers: McpServer[]) => {
    return servers.map((server) => {
      const stored = findConnectionForServer(connections, server);
      if (stored && stored.connectionStatus === "READY") {
        return {
          ...server,
          connectionStatus: stored.connectionStatus,
          tools: stored.tools,
        };
      }
      return {
        ...server,
        connectionStatus: server.connectionStatus || "DISCONNECTED",
        tools: server.tools || [],
      };
    });
  }, [connections]);

  const servers = useMemo(() => {
    if (!isFiltering) return [];
    const rawServers = data?.mcpServers?.edges?.map((edge) => edge.node) || [];
    return mergeWithConnectionState(rawServers);
  }, [data, isFiltering, mergeWithConnectionState, connections]);

  const pageInfo = data?.mcpServers?.pageInfo;

  // Load more filtered results
  const loadMore = useCallback(async () => {
    if (!pageInfo?.endCursor || isLoadingMore) return;

    setIsLoadingMore(true);
    try {
      await fetchMore({
        variables: {
          after: pageInfo.endCursor,
        },
      });
    } catch (err) {
      console.error("Failed to load more filtered results:", err);
    } finally {
      setIsLoadingMore(false);
    }
  }, [fetchMore, pageInfo?.endCursor, isLoadingMore]);

  return {
    servers,
    loading,
    error: error?.message || null,
    hasNextPage: pageInfo?.hasNextPage || false,
    isLoadingMore,
    isFiltering,
    loadMore,
  };
}
