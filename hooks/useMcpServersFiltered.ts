"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { McpServer, Category } from "@/types/mcp";
import { useMcpStore, findConnectionForServer, type McpStore } from "@/lib/stores/mcp-store";
import { useDebounce } from "@/hooks/useDebounce";

export const MCP_CATALOG_SEARCH_DEBOUNCE_MS = 300;

interface FilterOptions {
  searchQuery?: string;
  categorySlug?: string;
  categories: Category[];
}

export function useMcpServersFiltered(
  options: FilterOptions,
  first: number = 10,
  searchDebounceMs: number = MCP_CATALOG_SEARCH_DEBOUNCE_MS
) {
  const { searchQuery, categorySlug } = options;
  const debouncedSearch = useDebounce(searchQuery ?? "", searchDebounceMs).trim();
  const connections = useMcpStore((state: McpStore) => state.connections);

  const isFiltering = Boolean(debouncedSearch || categorySlug);

  const {
    data,
    isLoading: loading,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage: isLoadingMore,
  } = useInfiniteQuery({
    queryKey: ["mcpServersFiltered", { debouncedSearch, categorySlug, first }],
    queryFn: async ({ pageParam }: { pageParam: string | null }) => {
      const params = new URLSearchParams();
      params.set("first", String(first));
      params.set("public", "true");
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (categorySlug) params.set("categorySlug", categorySlug);
      if (pageParam) params.set("after", pageParam);

      const res = await fetch(`/api/mcp?${params}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Failed to load servers");
      
      return j as {
        servers: McpServer[];
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
      };
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) =>
      lastPage.pageInfo.hasNextPage ? lastPage.pageInfo.endCursor : null,
    enabled: isFiltering,
  });

  const mergeWithConnectionState = useCallback(
    (list: McpServer[]) => {
      return list.map((server) => {
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
    },
    [connections]
  );

  const servers = useMemo(() => {
    if (!isFiltering || !data) return [];
    const flatServers = data.pages.flatMap((page) => page.servers);
    return mergeWithConnectionState(flatServers);
  }, [isFiltering, data, mergeWithConnectionState]);

  const loadMore = useCallback(async () => {
    if (hasNextPage && !isLoadingMore) {
      await fetchNextPage();
    }
  }, [hasNextPage, isLoadingMore, fetchNextPage]);

  return {
    servers,
    loading: isFiltering ? loading : false,
    error: error ? error.message : null,
    hasNextPage: hasNextPage || false,
    isLoadingMore,
    isFiltering,
    loadMore,
  };
}
