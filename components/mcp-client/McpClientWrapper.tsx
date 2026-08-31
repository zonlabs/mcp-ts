"use client";

import McpClientLayout from "@/components/mcp-client/McpClientLayout";
import { useMcpConnection } from "@/hooks/useMcpConnection";
import { UserSession } from "@/components/providers/AuthProvider";
import { McpServer } from "@/types/mcp";

interface McpClientWrapperProps {
  session: UserSession | null;
}

export default function McpClientWrapper({ session }: McpClientWrapperProps) {
  const { connect, disconnect } = useMcpConnection();

  const handleServerAction = async (server: McpServer, action: "activate" | "deactivate") => {
    if (action === "activate") {
      await connect(server);
    } else {
      await disconnect(server);
    }
  };

  const handleServerAdd = async (data: Record<string, unknown>) => {
    const res = await fetch("/api/mcp/servers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok || json.error) throw new Error(json.error || "Failed to add server");
    return json;
  };

  const handleServerUpdate = async (data: Record<string, unknown>) => {
    const res = await fetch("/api/mcp/servers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok || json.error) throw new Error(json.error || "Failed to update server");
    return json;
  };

  const handleServerDelete = async (serverId: string) => {
    const res = await fetch(`/api/mcp/servers?id=${encodeURIComponent(serverId)}`, {
      method: "DELETE",
    });
    const json = await res.json();
    if (!res.ok || json.error) throw new Error(json.error || "Failed to delete server");
  };

  return (
    <McpClientLayout
      session={session}
      onServerAction={handleServerAction}
      onServerAdd={handleServerAdd}
      onServerUpdate={handleServerUpdate}
      onServerDelete={handleServerDelete}
    />
  );
}
