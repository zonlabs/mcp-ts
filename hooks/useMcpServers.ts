"use client";
import { useState, useEffect, useCallback } from "react";
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
  handleServerDelete: (serverName: string) => Promise<void>;
}

export function useMcpServers(): McpServersData {
  const [servers, setServers] = useState<McpServer[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchServers = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.set('first', '100');
      params.set('public', '1');
      params.set('orderBy', '-createdAt');
      const response = await fetch(`/api/mcp?${params}`);

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to fetch servers');
      }

      setServers(Array.isArray(result.servers) ? result.servers : []);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch servers';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, []);

  const updateServer = useCallback((serverId: string, updates: Partial<McpServer>) => {
    setServers(prevServers => {
      if (!prevServers) return prevServers;
      return prevServers.map(server =>
        server.id === serverId
          ? { ...server, ...updates }
          : server
      );
    });
  }, []);

  const handleServerAction = useCallback(async (server: McpServer, action: 'activate' | 'deactivate') => {
    try {
      const response = await fetch('/api/mcp/actions', {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action,
          serverName: server.name
        }),
      });

      const result = await response.json();

      if (!response.ok || result.errors) {
        throw new Error(result.errors?.[0]?.message || 'Action failed');
      }

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

      setServers(prevServers => {
        if (!prevServers) return prevServers;
        return prevServers.map(s => {
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
    } catch {
      toast.error(`Failed to ${action} server`);
      throw new Error(`Failed to ${action} server`);
    }
  }, []);

  const handleServerAdd = useCallback(async (data: any) => {
    const response = await fetch('/api/mcp/servers', {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });

    const result = await response.json();
    if (!response.ok || result.error) {
      throw new Error(result.error || 'Failed to add server');
    }

    await fetchServers();
    toast.success('Server added successfully');
  }, [fetchServers]);

  const handleServerUpdate = useCallback(async (data: any) => {
    const response = await fetch('/api/mcp/servers', {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });

    const result = await response.json();
    if (!response.ok || result.error) {
      throw new Error(result.error || 'Failed to update server');
    }

    await fetchServers();
    toast.success('Server updated successfully');
  }, [fetchServers]);

  const handleServerDelete = useCallback(async (serverName: string) => {
    const response = await fetch(`/api/mcp/servers?name=${encodeURIComponent(serverName)}`, {
      method: "DELETE",
    });

    const result = await response.json();
    if (!response.ok || result.error) {
      throw new Error(result.error || 'Failed to delete server');
    }

    await fetchServers();
    toast.success('Server deleted successfully');
  }, [fetchServers]);

  useEffect(() => {
    fetchServers();
  }, [fetchServers]);

  return {
    servers,
    loading,
    error,
    refresh: fetchServers,
    updateServer,
    handleServerAction,
    handleServerAdd,
    handleServerUpdate,
    handleServerDelete,
  };
}
