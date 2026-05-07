import McpClientLayout from "@/components/mcp-client/McpClientLayout";
import { useMcpServers } from "@/hooks/useMcpServers";
import { UserSession } from "@/components/providers/AuthProvider";

interface McpClientWrapperProps {
  session: UserSession | null;
}

export default function McpClientWrapper({ session }: McpClientWrapperProps) {
  const {
    servers,
    loading,
    error,
    refresh,
    updateServer,
    handleServerAction,
    handleServerAdd,
    handleServerUpdate,
    handleServerDelete,
  } = useMcpServers();



  return (
    <McpClientLayout
      publicServers={servers?.filter(s => s.isPublic) ?? null}
      userServers={servers?.filter(s => !s.isPublic) ?? null}
      publicLoading={loading}
      userLoading={loading}
      publicError={error}
      userError={error}
      session={session}
      onRefreshPublic={refresh}
      onRefreshUser={refresh}
      onServerAction={handleServerAction}
      onServerAdd={handleServerAdd}
      onServerUpdate={handleServerUpdate}
      onServerDelete={handleServerDelete}
      onUpdatePublicServer={updateServer}
      onUpdateUserServer={updateServer}
      hasNextPage={false}
      isLoadingMore={false}
      onLoadMore={() => { }}
    />
  );
}
