import { NextResponse, NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getStoredMcpConnectionsForIdentity } from "@/lib/mcp-connections";

const SELECT_COLUMNS = [
  "id",
  "user_id",
  "request_id",
  "mcp_session_id",
  "server_id",
  "server_name",
  "app_key",
  "tool_name",
  "tool_namespace",
  "status",
  "error_code",
  "error_preview",
  "started_at",
  "completed_at",
  "duration_ms",
  "created_at",
].join(",");

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const pageStr = searchParams.get("page") || "1";
    let currentPage = Math.max(1, parseInt(pageStr, 10));
    if (isNaN(currentPage)) {
      currentPage = 1;
    }

    const pageSize = 10;
    const from = (currentPage - 1) * pageSize;
    const to = from + pageSize - 1;

    const [connections, oauthGrantsResult, paginatedResult, metricsResult] = await Promise.all([
      getStoredMcpConnectionsForIdentity(user.id),
      supabase.auth.oauth.listGrants(),
      supabase
        .from("mcp_tool_call_events")
        .select(SELECT_COLUMNS, { count: "exact" })
        .eq("user_id", user.id)
        .order("started_at", { ascending: false })
        .range(from, to),
      supabase
        .from("mcp_tool_call_events")
        .select("started_at,status,app_key,server_id,server_name")
        .eq("user_id", user.id)
        .order("started_at", { ascending: false })
        .limit(5000),
    ]);

    const { data: grantsData, error: grantsError } = oauthGrantsResult;
    const { data: eventsData, count, error: eventsError } = paginatedResult;
    const { data: metricsData, error: metricsError } = metricsResult;

    if (grantsError || eventsError || metricsError) {
      const errorMsg = grantsError?.message || eventsError?.message || metricsError?.message;
      return NextResponse.json({ error: errorMsg }, { status: 500 });
    }

    const mappedGrants = (grantsData ?? []).map((g) => ({
      id: g.client.id,
      client_id: g.client.id,
      client_name: g.client.name,
      redirect_uri: g.client.uri || "",
      scope: (g.scopes || []).join(" "),
      token_prefix: "",
      created_at: g.granted_at,
      expires_at: null,
      last_used_at: null,
    }));

    return NextResponse.json({
      connections: connections ?? [],
      grants: mappedGrants,
      events: eventsData ?? [],
      metricsEvents: metricsData ?? [],
      totalCount: count ?? 0,
      currentPage,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch usage";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
