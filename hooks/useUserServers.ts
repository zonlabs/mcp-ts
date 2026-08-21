"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { toast } from "react-hot-toast";
import { McpServer } from "@/types/mcp";
import { useMcpContext } from "@/components/providers/McpProvider";
import { findConnectionForServer } from "@/lib/mcp/connection-utils";

export function useUserServers() {
  const queryClient = useQueryClient();
  const { connections } = useMcpContext();

  const query = useQuery<McpServer[], Error>({
    queryKey: ["userServers"],
    queryFn: async () => {
      const res = await fetch("/api/mcp/user");
      if (!res.ok) {
        if (res.status === 401) return [];
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Failed to load user servers");
      }
      const data = await res.json();
      return Array.isArray(data.servers) ? data.servers : [];
    },
    staleTime: 1000 * 60 * 2, // 2 minutes
  });

  // Merge live connection state from McpProvider
  const userServers = useMemo(() => {
    const raw = query.data ?? [];
    return raw.map((server) => {
      const stored = findConnectionForServer(connections, server);
      if (stored) {
        return {
          ...server,
          connectionStatus: stored.state === "READY" ? "READY" : stored.state,
          transport: stored.transport ?? server.transport,
          tools: (stored.tools as any[]) ?? server.tools ?? [],
        };
      }
      return {
        ...server,
        connectionStatus: server.connectionStatus || "DISCONNECTED",
      };
    });
  }, [query.data, connections]);

  const addServerMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await fetch("/api/mcp/servers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to add server");
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["userServers"] });
      toast.success("Server added successfully");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to add server");
    },
  });

  const updateServerMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await fetch("/api/mcp/servers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to update server");
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["userServers"] });
      toast.success("Server updated successfully");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to update server");
    },
  });

  const deleteServerMutation = useMutation({
    mutationFn: async (serverId: string) => {
      const res = await fetch(`/api/mcp/servers?id=${serverId}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to delete server");
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["userServers"] });
      toast.success("Server deleted successfully");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to delete server");
    },
  });

  return {
    userServers,
    rawServers: query.data ?? [],
    loading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error?.message ?? null,
    refetch: query.refetch,
    addServer: addServerMutation.mutateAsync,
    updateServer: updateServerMutation.mutateAsync,
    deleteServer: deleteServerMutation.mutateAsync,
    isAdding: addServerMutation.isPending,
    isUpdating: updateServerMutation.isPending,
    isDeleting: deleteServerMutation.isPending,
  };
}
