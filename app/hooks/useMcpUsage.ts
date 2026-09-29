"use client";

import { useQuery } from "@tanstack/react-query";
import type { McpToolCallEventRow, McpToolCallEventGroup } from "@/lib/mcp-usage";

export interface McpUsageResponse {
  connections: unknown[];
  grants: unknown[];
  groups: McpToolCallEventGroup[];
  metricsEvents: McpToolCallEventRow[];
  totalCount: number;
  mcpAssistantCount: number;
  currentPage: number;
}

/**
 * Hook to fetch and cache remote MCP tool call usage and metrics with TanStack Query.
 *
 * @param page The 1-based page index for top-level recent activity.
 * @returns Query state containing usage response data, loading states, and refetch handler.
 */
export function useMcpUsage(page: number) {
  const { data, isLoading, error, isFetching, refetch } = useQuery<McpUsageResponse, Error>({
    queryKey: ["mcpUsage", page],
    queryFn: async () => {
      const res = await fetch(`/api/remote-mcp/usage?page=${page}`);
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to load remote MCP details");
      }
      return json as McpUsageResponse;
    },
    staleTime: 1000 * 60 * 5, // 5 minutes fresh in-memory cache
    placeholderData: (previousData) => previousData,
  });

  return { data, isLoading, error, isFetching, refetch };
}
