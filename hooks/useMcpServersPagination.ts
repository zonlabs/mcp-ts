"use client";

import { useState, useCallback, useEffect } from "react";
import { McpServer } from "@/types/mcp";
import { useMcpConnection } from "./useMcpConnection";
import { findConnectionForServer } from "@/lib/stores/mcp-store";

/**
 * Paginated public MCP catalog via GET /api/mcp (REST).
 */
export function useMcpServersPagination(first: number = 10) {
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [servers, setServers] = useState<McpServer[]>([]);
  const [pageInfo, setPageInfo] = useState<{
    hasNextPage: boolean;
    endCursor: string | null;
  } | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const { connections } = useMcpConnection();

  const fetchPage = useCallback(
    async (after?: string | null) => {
      const params = new URLSearchParams();
      params.set("first", String(first));
      params.set("public", "1");
      params.set("orderBy", "-createdAt");
      if (after) params.set("after", after);
      const res = await fetch(`/api/mcp?${params}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Failed to load servers");
      return j as {
        servers: McpServer[];
        totalCount: number;
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
      };
    },
    [first]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const j = await fetchPage();
        if (cancelled) return;
        setServers(j.servers);
        setPageInfo(j.pageInfo);
        setTotalCount(j.totalCount);
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
  }, [fetchPage]);

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

  const mergedServers = mergeWithConnectionState(servers);

  const loadMore = useCallback(async () => {
    if (!pageInfo?.endCursor || !pageInfo.hasNextPage || isLoadingMore) return;

    setIsLoadingMore(true);
    try {
      const j = await fetchPage(pageInfo.endCursor);
      setServers((prev) => [...prev, ...j.servers]);
      setPageInfo(j.pageInfo);
    } catch (err) {
      console.error("Failed to load more servers:", err);
    } finally {
      setIsLoadingMore(false);
    }
  }, [fetchPage, pageInfo?.endCursor, pageInfo?.hasNextPage, isLoadingMore]);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const j = await fetchPage();
      setServers(j.servers);
      setPageInfo(j.pageInfo);
      setTotalCount(j.totalCount);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load servers");
    } finally {
      setLoading(false);
    }
  }, [fetchPage]);

  return {
    servers: mergedServers,
    loading,
    error,
    hasNextPage: pageInfo?.hasNextPage || false,
    isLoadingMore,
    totalCount,
    loadMore,
    refetch,
  };
}
