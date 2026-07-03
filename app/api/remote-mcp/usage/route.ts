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
  "server_url",
  "app_key",
  "tool_name",
  "tool_namespace",
  "event_type",
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
        .eq("event_type", "top_level")
        .order("completed_at", { ascending: false })
        .range(from, to),
      supabase
        .from("mcp_tool_call_events")
        .select("started_at,status,app_key,server_id,server_name,server_url,event_type")
        .eq("user_id", user.id)
        .order("completed_at", { ascending: false })
        .order("event_type", { ascending: false })
        .limit(5000),
    ]);

    const { data: grantsData, error: grantsError } = oauthGrantsResult;
    const { data: rawParentEvents, count, error: eventsError } = paginatedResult;
    const { data: metricsData, error: metricsError } = metricsResult;

    if (grantsError || eventsError || metricsError) {
      const errorMsg = grantsError?.message || eventsError?.message || metricsError?.message;
      return NextResponse.json({ error: errorMsg }, { status: 500 });
    }

    const parentEvents = (rawParentEvents ?? []) as unknown as Record<string, unknown>[];

    // Fetch children events sharing the same request_ids as the returned parents
    const requestIds = [...new Set(parentEvents.map((e) => e.request_id as string))];
    let children: Record<string, unknown>[] = [];
    if (requestIds.length > 0) {
      const { data: childData } = await supabase
        .from("mcp_tool_call_events")
        .select(SELECT_COLUMNS)
        .eq("user_id", user.id)
        .in("request_id", requestIds)
        .neq("event_type", "top_level")
        .order("started_at", { ascending: true });
      children = (childData ?? []) as unknown as Record<string, unknown>[];
    }

    // Group children by request_id
    const childrenByRequestId = new Map<string, Record<string, unknown>[]>();
    for (const child of children) {
      const rid = child.request_id as string;
      const existing = childrenByRequestId.get(rid) ?? [];
      existing.push(child);
      childrenByRequestId.set(rid, existing);
    }

    // Build hierarchical groups: parent + its children
    const groups = (parentEvents ?? []).map((parent) => ({
      parent,
      children: childrenByRequestId.get(parent.request_id as string) ?? [],
    }));

    const grants = (grantsData ?? []).map((g) => ({
      id: g.client.id,
      client_name: g.client.name,
      redirect_uri: g.client.uri,
      logo_uri: g.client.logo_uri,
      scope: g.scopes?.join(" ") ?? "",
      created_at: g.granted_at,
    }));

    return NextResponse.json({
      connections: connections ?? [],
      grants,
      groups,
      metricsEvents: metricsData ?? [],
      totalCount: count ?? 0,
      currentPage,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch usage";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
