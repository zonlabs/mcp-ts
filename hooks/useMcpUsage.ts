"use client";

import { useQuery } from "@tanstack/react-query";

export function useMcpUsage(page: number) {
  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ["mcpUsage", page],
    queryFn: async () => {
      const res = await fetch(`/api/remote-mcp/usage?page=${page}`);
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to load remote MCP details");
      }
      return json;
    },
    placeholderData: (previousData) => previousData,
  });

  return { data, isLoading, error, isFetching };
}
