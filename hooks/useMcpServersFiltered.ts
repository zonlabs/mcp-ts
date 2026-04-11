"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { McpServer, Category } from "@/types/mcp";
import { useMcpStore, findConnectionForServer, type McpStore } from "@/lib/stores/mcp-store";
import { useDebounce } from "@/hooks/useDebounce";

/** Delay before `search` is sent to GET /api/mcp (avoids a request per keystroke). */
export const MCP_CATALOG_SEARCH_DEBOUNCE_MS = 300;

interface FilterOptions {
  searchQuery?: string;
  categorySlug?: string;
  /** Retained for call-site compatibility; filtering uses `categorySlug` on the API. */
  categories: Category[];
}

/**
 * Filtered public catalog via GET /api/mcp?search=&categorySlug= (REST).
 * Search text is debounced inside this hook before any fetch.
 */
export function useMcpServersFiltered(
  options: FilterOptions,
  first: number = 10,
  searchDebounceMs: number = MCP_CATALOG_SEARCH_DEBOUNCE_MS
) {
  const { searchQuery, categorySlug } = options;
  const debouncedSearch = useDebounce(searchQuery ?? "", searchDebounceMs).trim();
  const connections = useMcpStore((state: McpStore) => state.connections);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filteredServers, setFilteredServers] = useState<McpServer[]>([]);
  const [filterPageInfo, setFilterPageInfo] = useState<{
    hasNextPage: boolean;
    endCursor: string | null;
  } | null>(null);

  const isFiltering = Boolean(debouncedSearch || categorySlug);

  const fetchPage = useCallback(
    async (after?: string | null) => {
      const params = new URLSearchParams();
      params.set("first", String(first));
      params.set("public", "1");
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (categorySlug) params.set("categorySlug", categorySlug);
      if (after) params.set("after", after);
      const res = await fetch(`/api/mcp?${params}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Failed to load servers");
      return j as {
        servers: McpServer[];
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
      };
    },
    [first, debouncedSearch, categorySlug]
  );

  useEffect(() => {
    if (!isFiltering) {
      setFilteredServers([]);
      setFilterPageInfo(null);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const j = await fetchPage();
        if (cancelled) return;
        setFilteredServers(j.servers);
        setFilterPageInfo(j.pageInfo);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load servers");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isFiltering, fetchPage]);

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
    if (!isFiltering) return [];
    return mergeWithConnectionState(filteredServers);
  }, [isFiltering, filteredServers, mergeWithConnectionState]);

  const loadMore = useCallback(async () => {
    if (!filterPageInfo?.endCursor || !filterPageInfo.hasNextPage || isLoadingMore) return;

    setIsLoadingMore(true);
    try {
      const j = await fetchPage(filterPageInfo.endCursor);
      setFilteredServers((prev) => [...prev, ...j.servers]);
      setFilterPageInfo(j.pageInfo);
    } catch (err) {
      console.error("Failed to load more filtered results:", err);
    } finally {
      setIsLoadingMore(false);
    }
  }, [fetchPage, filterPageInfo?.endCursor, filterPageInfo?.hasNextPage, isLoadingMore]);

  return {
    servers,
    loading,
    error,
    hasNextPage: filterPageInfo?.hasNextPage || false,
    isLoadingMore,
    isFiltering,
    loadMore,
  };
}
