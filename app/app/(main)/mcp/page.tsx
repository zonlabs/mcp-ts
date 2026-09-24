import McpPageClient from "./McpPageClient";
import { createClient } from "@/lib/supabase/server";
import { SERVER_SELECT } from "@/lib/mcp-servers/service";
import { restMcpServer } from "@/lib/mcp-servers/rest-serialize";
import { UserSession } from "@/components/providers/AuthProvider";
import { mapServerRow } from "@/lib/mcp-servers/types";
import { McpServer } from "@/types/mcp";
import { redirect } from "next/navigation";

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

/**
 * Server component for /mcp.
 * Lightweight auth verification and deep-link server resolution only.
 * Heavy analytics and usage telemetry are fetched asynchronously on the client via TanStack Query.
 */
export default async function McpPage({ searchParams }: PageProps) {
  const resolvedSearchParams = await searchParams;
  const serverId =
    typeof resolvedSearchParams.server === "string"
      ? resolvedSearchParams.server
      : undefined;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/signin?redirect=/mcp");
  }

  const userSession: UserSession = { user };

  let serversideSelectedServer: McpServer | null = null;

  if (serverId) {
    const { data: serverRow } = await supabase
      .from("mcp_servers")
      .select(SERVER_SELECT)
      .eq("id", serverId)
      .maybeSingle();

    if (serverRow) {
      const matchedNode = mapServerRow(serverRow);
      serversideSelectedServer = restMcpServer(matchedNode, {
        includeHeaders: true,
        includeCredentials: matchedNode.owner === user.id,
      });
    }
  }

  return (
    <McpPageClient
      userSession={userSession}
      initialSelectedServer={serversideSelectedServer}
    />
  );
}

