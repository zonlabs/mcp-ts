import McpPageClient from "./McpPageClient";
import { createClient } from "@/lib/supabase/server";
import { listMcpServersCatalog, listUserMcpServers, SERVER_SELECT } from "@/lib/mcp-servers/service";
import { restMcpServer } from "@/lib/mcp-servers/rest-serialize";
import { UserSession } from "@/components/providers/AuthProvider";
import { mapServerRow } from "@/lib/mcp-servers/types";
import { McpServer } from "@/types/mcp";

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function McpPage({ searchParams }: PageProps) {
  const resolvedSearchParams = await searchParams;
  const serverId = typeof resolvedSearchParams.server === "string" ? resolvedSearchParams.server : undefined;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const userSession: UserSession | null = user ? { user } : null;

  // Execute database operations
  const [publicResult, userResult, featuredResult, matchedServerResult] = await Promise.allSettled([
    listMcpServersCatalog(supabase, {
      first: 20,
      orderField: "created_at",
      orderAscending: false,
      publicOnly: true,
    }),
    user ? listUserMcpServers(supabase, user.id) : Promise.resolve([]),
    listMcpServersCatalog(supabase, {
      first: 100,
      orderField: "name",
      orderAscending: true,
      featuredOnly: true,
      publicOnly: true,
    }),
    serverId ? supabase.from("mcp_servers").select(SERVER_SELECT).eq("id", serverId).maybeSingle() : Promise.resolve(null),
  ]);

  let publicServers =
    publicResult.status === "fulfilled"
      ? publicResult.value.edges.map((edge) => restMcpServer(edge.node))
      : [];
  const publicServersCount =
    publicResult.status === "fulfilled" ? publicResult.value.totalCount : 0;
  const publicHasNextPage =
    publicResult.status === "fulfilled"
      ? publicResult.value.pageInfo.hasNextPage
      : false;
  const publicEndCursor =
    publicResult.status === "fulfilled"
      ? publicResult.value.pageInfo.endCursor
      : null;
  const publicError =
    publicResult.status === "rejected" ? publicResult.reason instanceof Error
      ? publicResult.reason.message
      : "Failed to load servers" : null;

  const userServers =
    userResult.status === "fulfilled"
      ? userResult.value.map((node) => restMcpServer(node, { includeHeaders: true, includeCredentials: true }))
      : [];
  const userError =
    userResult.status === "rejected" ? userResult.reason instanceof Error
      ? userResult.reason.message
      : "Failed to load servers" : null;
  const featuredServers =
    featuredResult.status === "fulfilled"
      ? featuredResult.value.edges.map((edge) => restMcpServer(edge.node))
      : [];

  let serversideSelectedServer: McpServer | null = null;

  // Resolve matching server details serverside
  if (serverId && matchedServerResult.status === "fulfilled" && (matchedServerResult.value as any)?.data) {
    const matchedNode = mapServerRow((matchedServerResult.value as any).data);
    const matchedRest = restMcpServer(matchedNode, {
      includeHeaders: true,
      includeCredentials: matchedNode.owner === user?.id,
    });
    serversideSelectedServer = matchedRest;
    
    const exists =
      publicServers.some((s) => s.id === matchedRest.id) ||
      userServers.some((s) => s.id === matchedRest.id);

    if (!exists) {
      publicServers = [matchedRest, ...publicServers];
    }
  }

  return (
    <McpPageClient
      initialPublicServers={publicServers}
      initialUserServers={userServers}
      featuredServers={featuredServers}
      initialPublicServersCount={publicServersCount}
      initialUserServersCount={userServers.length}
      initialHasNextPage={publicHasNextPage}
      initialEndCursor={publicEndCursor}
      initialPublicError={publicError}
      initialUserError={userError}
      userSession={userSession}
      initialSelectedServer={serversideSelectedServer}
    />
  );
}
