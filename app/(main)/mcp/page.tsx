import McpPageClient from "./McpPageClient";
import { createClient } from "@/lib/supabase/server";
import { listMcpServersCatalog, listUserMcpServers } from "@/lib/mcp-servers/service";
import { restMcpServer } from "@/lib/mcp-servers/rest-serialize";
import { UserSession } from "@/components/providers/AuthProvider";

export default async function McpPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const userSession: UserSession | null = user ? { user } : null;

  const [publicResult, userResult, featuredResult] = await Promise.allSettled([
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
  ]);

  const publicServers =
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
      ? userResult.value.map((node) => restMcpServer(node, { includeHeaders: true }))
      : [];
  const userError =
    userResult.status === "rejected" ? userResult.reason instanceof Error
      ? userResult.reason.message
      : "Failed to load servers" : null;
  const featuredServers =
    featuredResult.status === "fulfilled"
      ? featuredResult.value.edges.map((edge) => restMcpServer(edge.node))
      : [];

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
    />
  );
}
