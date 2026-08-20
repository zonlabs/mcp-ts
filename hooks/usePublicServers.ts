"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { McpServer } from "@/types/mcp";
import { useMcpStore, findConnectionForServer, type McpStore } from "@/lib/stores/mcp-store";
import { useDebounce } from "@/hooks/useDebounce";

export const PUBLIC_SERVERS_PAGE_SIZE = 20;
export const PUBLIC_SERVERS_SEARCH_DEBOUNCE_MS = 350;

export interface UsePublicServersOptions {
  search?: string;
  categorySlug?: string;
  pageSize?: number;
  featured?: boolean;
}

export interface PublicServersPage {
  servers: McpServer[];
  totalCount: number;
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
}

/**
 * Single unified hook for the public MCP server catalog.
 *
 * - Uses TanStack `useInfiniteQuery` for cursor-based pagination
 * - Debounces `search` (350ms) and sends it to GET /api/mcp?search=
 * - Merges live connection state from the Zustand store
 * - Replaces: useMcpServers, useMcpServersPagination, useMcpServersFiltered, and the
 *   manual useState fetch in McpPageClient
 */
export function usePublicServers({
  search = "",
  categorySlug,
  pageSize = PUBLIC_SERVERS_PAGE_SIZE,
  featured,
}: UsePublicServersOptions = {}) {
  const debouncedSearch = useDebounce(search, PUBLIC_SERVERS_SEARCH_DEBOUNCE_MS).trim();
  const connections = useMcpStore((state: McpStore) => state.connections);

  const {
    data,
    isLoading,
    isFetchingNextPage,
    fetchNextPage,
    hasNextPage,
    error,
    refetch,
  } = useInfiniteQuery<PublicServersPage, Error>({
    queryKey: ["publicServers", { debouncedSearch, categorySlug, pageSize, featured }],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams();
      params.set("first", String(pageSize));
      params.set("public", "true");
      params.set("orderBy", "-createdAt");
      if (featured !== undefined) params.set("featured", String(featured));
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (categorySlug && categorySlug !== "all") params.set("categorySlug", categorySlug);
      if (pageParam) params.set("after", pageParam as string);

      const res = await fetch(`/api/mcp?${params}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load servers");

      return {
        servers: Array.isArray(json.servers) ? json.servers : [],
        totalCount: json.totalCount ?? 0,
        pageInfo: {
          hasNextPage: Boolean(json.pageInfo?.hasNextPage),
          endCursor: json.pageInfo?.endCursor ?? null,
        },
      };
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) =>
      lastPage.pageInfo.hasNextPage ? lastPage.pageInfo.endCursor : undefined,
  });

  /** Flat list of all loaded servers, merged with live connection state */
  const servers = useMemo<McpServer[]>(() => {
    if (!data) return [];
    const flat = data.pages.flatMap((page) => page.servers);
    return flat.map((server) => {
      const stored = findConnectionForServer(connections, server);
      if (stored) {
        return {
          ...server,
          connectionStatus: stored.connectionStatus,
          tools: stored.tools ?? server.tools ?? [],
        };
      }
      return {
        ...server,
        connectionStatus: server.connectionStatus || "DISCONNECTED",
        tools: server.tools ?? [],
      };
    });
  }, [data, connections]);

  const totalCount = data?.pages[0]?.totalCount ?? 0;

  const loadMore = () => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage();
  };

  return {
    servers,
    loading: isLoading,
    isLoadingMore: isFetchingNextPage,
    hasNextPage: hasNextPage ?? false,
    totalCount,
    error: error?.message ?? null,
    loadMore,
    refetch,
  };
}
