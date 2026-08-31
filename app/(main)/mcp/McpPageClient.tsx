"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import McpClientLayout from "@/components/mcp-client/McpClientLayout";
import { UserSession } from "@/components/providers/AuthProvider";
import { useMcpConnection } from "@/hooks/useMcpConnection";
import { McpServer } from "@/types/mcp";

function getSignInRedirectHref(redirect: string): string {
  const safeRedirect =
    redirect.startsWith("/") && !redirect.startsWith("//") ? redirect : "/";
  const params = new URLSearchParams({ redirect: safeRedirect });
  return `/signin?${params.toString()}`;
}

interface McpPageClientProps {
  userSession: UserSession | null;
  initialSelectedServer?: McpServer | null;
  initialUsageData?: any;
}

export default function McpPageClient({
  userSession,
  initialSelectedServer = null,
  initialUsageData = null,
}: McpPageClientProps) {
  const router = useRouter();
  const { connect, disconnect } = useMcpConnection();

  const handleServerAction = useCallback(
    async (server: McpServer, action: "activate" | "deactivate") => {
      if (action === "activate") {
        if (!userSession?.user) {
          router.push(getSignInRedirectHref("/mcp"));
          return { success: false, redirected: true };
        }
        await connect(server);
        return { success: true };
      }
      await disconnect(server);
      return { success: true };
    },
    [connect, disconnect, router, userSession]
  );

  const handleServerAdd = useCallback(
    async (data: Record<string, unknown>) => {
      const response = await fetch("/api/mcp/servers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const result = await response.json();
      if (!response.ok || result.error) {
        throw new Error(result.error || "Failed to add server");
      }
      return result;
    },
    []
  );

  const handleServerUpdate = useCallback(
    async (data: Record<string, unknown>) => {
      const response = await fetch("/api/mcp/servers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const result = await response.json();
      if (!response.ok || result.error) {
        throw new Error(result.error || "Failed to update server");
      }
      return result;
    },
    []
  );

  const handleServerDelete = useCallback(
    async (serverId: string) => {
      const response = await fetch(
        `/api/mcp/servers?id=${encodeURIComponent(serverId)}`,
        { method: "DELETE" }
      );
      const result = await response.json();
      if (!response.ok || result.error) {
        throw new Error(result.error || "Failed to delete server");
      }
    },
    []
  );

  return (
    <McpClientLayout
      session={userSession}
      userSession={userSession}
      onServerAction={handleServerAction}
      onServerAdd={handleServerAdd}
      onServerUpdate={handleServerUpdate}
      onServerDelete={handleServerDelete}
      initialSelectedServer={initialSelectedServer}
      initialUsageData={initialUsageData}
    />
  );
}
