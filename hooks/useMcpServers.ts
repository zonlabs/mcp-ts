"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { toast } from "react-hot-toast";
import { McpServer } from "@/types/mcp";

interface McpServersData {
  servers: McpServer[] | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  updateServer: (serverId: string, updates: Partial<McpServer>) => void;
  handleServerAction: (server: McpServer, action: 'activate' | 'deactivate') => Promise<void>;
  handleServerAdd: (data: any) => Promise<void>;
  handleServerUpdate: (data: any) => Promise<void>;
  handleServerDelete: (serverId: string) => Promise<void>;
}

export function useMcpServers(): McpServersData {
  const queryClient = useQueryClient();

  const { data: servers, isLoading: loading, error, refetch } = useQuery<McpServer[], Error>({
    queryKey: ["mcpServers"],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('first', '100');
      params.set('public', '1');
      params.set('orderBy', '-createdAt');
      const response = await fetch(`/api/mcp?${params}`);
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Failed to fetch servers');
      }
      return Array.isArray(result.servers) ? result.servers : [];
    },
  });

  const refresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const updateServer = useCallback((serverId: string, updates: Partial<McpServer>) => {
    queryClient.setQueryData<McpServer[]>(["mcpServers"], (old) => {
      if (!old) return old;
      return old.map((server) =>
        server.id === serverId ? { ...server, ...updates } : server
      );
    });
  }, [queryClient]);

  const actionMutation = useMutation({
    mutationFn: async ({ server, action }: { server: McpServer; action: 'activate' | 'deactivate' }) => {
      const response = await fetch('/api/mcp/actions', {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, serverName: server.name }),
      });
      const result = await response.json();
      if (!response.ok || result.errors) {
        throw new Error(result.errors?.[0]?.message || 'Action failed');
      }
      return { result, action, server };
    },
    onSuccess: ({ result, action, server }) => {
      if (action === 'activate') {
        const connectResult = result.data?.connectMcpServer;
        if (connectResult?.requiresAuth) {
          const authUrl = connectResult.authorizationUrl;
          if (authUrl) {
            setTimeout(() => {
              window.location.href = authUrl;
            }, 500);
            return;
          } else {
            throw new Error('OAuth required but no authorization URL provided');
          }
        }
      }
      queryClient.setQueryData<McpServer[]>(["mcpServers"], (old) => {
        if (!old) return old;
        return old.map((s) => {
          if (s.name === server.name) {
            const updatedServer = result.data?.connectMcpServer || result.data?.disconnectMcpServer;
            const newConnectionStatus = updatedServer?.connectionStatus ||
              (action === 'activate' ? 'CONNECTED' : 'DISCONNECTED');

            return {
              ...s,
              connectionStatus: newConnectionStatus,
              tools: (action === 'deactivate' || newConnectionStatus === 'FAILED') ? [] : (updatedServer?.tools || s.tools),
              updated_at: new Date().toISOString()
            };
          }
          return s;
        });
      });
    },
    onError: (err, { action }) => {
      toast.error(err instanceof Error ? err.message : `Failed to ${action} server`);
    }
  });

  const addMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await fetch('/api/mcp/servers', {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const result = await response.json();
      if (!response.ok || result.error) {
        throw new Error(result.error || 'Failed to add server');
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mcpServers"] });
      toast.success('Server added successfully');
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to add server');
    }
  });

  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await fetch('/api/mcp/servers', {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const result = await response.json();
      if (!response.ok || result.error) {
        throw new Error(result.error || 'Failed to update server');
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mcpServers"] });
      toast.success('Server updated successfully');
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to update server');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (serverId: string) => {
      const response = await fetch(`/api/mcp/servers?id=${encodeURIComponent(serverId)}`, {
        method: "DELETE",
      });
      const result = await response.json();
      if (!response.ok || result.error) {
        throw new Error(result.error || 'Failed to delete server');
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mcpServers"] });
      toast.success('Server deleted successfully');
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to delete server');
    }
  });

  const handleServerAction = useCallback(async (server: McpServer, action: 'activate' | 'deactivate') => {
    await actionMutation.mutateAsync({ server, action });
  }, [actionMutation]);

  const handleServerAdd = useCallback(async (data: any) => {
    await addMutation.mutateAsync(data);
  }, [addMutation]);

  const handleServerUpdate = useCallback(async (data: any) => {
    await updateMutation.mutateAsync(data);
  }, [updateMutation]);

  const handleServerDelete = useCallback(async (serverId: string) => {
    await deleteMutation.mutateAsync(serverId);
  }, [deleteMutation]);

  return {
    servers: servers ?? null,
    loading,
    error: error ? error.message : null,
    refresh,
    updateServer,
    handleServerAction,
    handleServerAdd,
    handleServerUpdate,
    handleServerDelete,
  };
}
