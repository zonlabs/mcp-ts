"use client";

import { useCallback, useState } from "react";
import McpClientLayout from "@/components/mcp-client/McpClientLayout";
import { UserSession } from "@/components/providers/AuthProvider";
import { useMcpConnection } from "@/hooks/useMcpConnection";
import { McpServer } from "@/types/mcp";

interface PublicServersResponse {
  servers: McpServer[];
  totalCount: number;
  pageInfo?: {
    hasNextPage: boolean;
    endCursor: string | null;
  };
  error?: string;
}

interface UserServersResponse {
  servers: McpServer[];
  error?: string;
}

interface McpPageClientProps {
  initialPublicServers: McpServer[];
  initialUserServers: McpServer[];
  featuredServers: McpServer[];
  initialPublicServersCount: number;
  initialUserServersCount: number;
  initialHasNextPage: boolean;
  initialEndCursor: string | null;
  initialPublicError: string | null;
  initialUserError: string | null;
  userSession: UserSession | null;
}

export default function McpPageClient({
  initialPublicServers,
  initialUserServers,
  featuredServers,
  initialPublicServersCount,
  initialUserServersCount,
  initialHasNextPage,
  initialEndCursor,
  initialPublicError,
  initialUserError,
  userSession,
}: McpPageClientProps) {
  const [publicServers, setPublicServers] = useState<McpServer[]>(initialPublicServers);
  const [userServers, setUserServers] = useState<McpServer[]>(initialUserServers);
  const [publicServersCount, setPublicServersCount] = useState(initialPublicServersCount);
  const [userServersCount, setUserServersCount] = useState(initialUserServersCount);
  const [hasNextPage, setHasNextPage] = useState(initialHasNextPage);
  const [endCursor, setEndCursor] = useState<string | null>(initialEndCursor);
  const [publicLoading, setPublicLoading] = useState(false);
  const [userLoading, setUserLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [publicError, setPublicError] = useState<string | null>(initialPublicError);
  const [userError, setUserError] = useState<string | null>(initialUserError);
  const { connect, disconnect } = useMcpConnection();

  const fetchPublicServers = useCallback(async (after?: string | null) => {
    const isPagination = Boolean(after);

    if (isPagination) {
      setIsLoadingMore(true);
    } else {
      setPublicLoading(true);
    }
    setPublicError(null);

    try {
      const params = new URLSearchParams();
      params.set("first", "20");
      params.set("public", "true");
      params.set("orderBy", "-createdAt");
      if (after) {
        params.set("after", after);
      }

      const response = await fetch(`/api/mcp?${params}`);
      const result = (await response.json()) as PublicServersResponse;

      if (!response.ok) {
        throw new Error(result.error || "Failed to fetch servers");
      }

      setPublicServers((prev) => (isPagination ? [...prev, ...result.servers] : result.servers));
      setPublicServersCount(result.totalCount);
      setHasNextPage(Boolean(result.pageInfo?.hasNextPage));
      setEndCursor(result.pageInfo?.endCursor ?? null);
    } catch (error) {
      setPublicError(error instanceof Error ? error.message : "Failed to fetch servers");
    } finally {
      if (isPagination) {
        setIsLoadingMore(false);
      } else {
        setPublicLoading(false);
      }
    }
  }, []);

  const fetchUserServers = useCallback(async () => {
    setUserLoading(true);
    setUserError(null);

    try {
      const response = await fetch("/api/mcp/user");
      const result = (await response.json()) as UserServersResponse;

      if (!response.ok) {
        throw new Error(result.error || "Failed to fetch servers");
      }

      setUserServers(result.servers);
      setUserServersCount(result.servers.length);
    } catch (error) {
      setUserError(error instanceof Error ? error.message : "Failed to fetch servers");
    } finally {
      setUserLoading(false);
    }
  }, []);

  const refreshAllServers = useCallback(async () => {
    await Promise.all([fetchPublicServers(), fetchUserServers()]);
  }, [fetchPublicServers, fetchUserServers]);

  const handleServerAction = useCallback(
    async (server: McpServer, action: "activate" | "deactivate") => {
      if (action === "activate") {
        await connect(server);
        return { success: true };
      }

      await disconnect(server);
      return { success: true };
    },
    [connect, disconnect]
  );

  const handleServerAdd = useCallback(
    async (data: Record<string, unknown>) => {
      const response = await fetch("/api/mcp/servers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      const result = await response.json();
      if (!response.ok || result.error) {
        throw new Error(result.error || "Failed to add server");
      }

      await refreshAllServers();
    },
    [refreshAllServers]
  );

  const handleServerUpdate = useCallback(
    async (data: Record<string, unknown>) => {
      const response = await fetch("/api/mcp/servers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      const result = await response.json();
      if (!response.ok || result.error) {
        throw new Error(result.error || "Failed to update server");
      }

      await refreshAllServers();
    },
    [refreshAllServers]
  );

  const handleServerDelete = useCallback(
    async (serverId: string) => {
      const response = await fetch(`/api/mcp/servers?id=${encodeURIComponent(serverId)}`, {
        method: "DELETE",
      });

      const result = await response.json();
      if (!response.ok || result.error) {
        throw new Error(result.error || "Failed to delete server");
      }

      await refreshAllServers();
    },
    [refreshAllServers]
  );

  const handleLoadMore = useCallback(async () => {
    if (!hasNextPage || !endCursor || isLoadingMore) {
      return;
    }

    await fetchPublicServers(endCursor);
  }, [endCursor, fetchPublicServers, hasNextPage, isLoadingMore]);

  return (
    <McpClientLayout
      publicServers={publicServers}
      userServers={userServers}
      featuredServers={featuredServers}
      publicServersCount={publicServersCount}
      userServersCount={userServersCount}
      publicLoading={publicLoading}
      userLoading={userLoading}
      publicError={publicError}
      userError={userError}
      session={userSession}
      userSession={userSession}
      onRefreshPublic={fetchPublicServers}
      onRefreshUser={fetchUserServers}
      onServerAction={handleServerAction}
      onServerAdd={handleServerAdd}
      onServerUpdate={handleServerUpdate}
      onServerDelete={handleServerDelete}
      onUpdatePublicServer={() => {}}
      onUpdateUserServer={() => {}}
      hasNextPage={hasNextPage}
      isLoadingMore={isLoadingMore}
      onLoadMore={handleLoadMore}
    />
  );
}
