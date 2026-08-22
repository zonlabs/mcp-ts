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
  "server_icons",
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

const METRICS_PAGE_SIZE = 1000;

async function fetchAllMetricsEvents(supabase: any, userId: string) {
  const allEvents: any[] = [];
  let page = 0;

  while (true) {
    const from = page * METRICS_PAGE_SIZE;
    const to = from + METRICS_PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from("mcp_tool_call_events")
      .select("id,started_at,status,app_key,server_id,server_name,server_url,server_icons,event_type")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to);

    if (error) throw error;
    if (!data || data.length === 0) break;
    allEvents.push(...data);
    if (data.length < METRICS_PAGE_SIZE) break;
    page++;
  }

  return allEvents;
}

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

    const [connections, oauthGrantsResult, paginatedResult, metricsResult, totalCountResult] = await Promise.all([
      getStoredMcpConnectionsForIdentity(user.id),
      supabase.auth.oauth.listGrants(),
      supabase
        .from("mcp_tool_call_events")
        .select(SELECT_COLUMNS, { count: "exact" })
        .eq("user_id", user.id)
        .eq("event_type", "top_level")
        .order("completed_at", { ascending: false })
        .range(from, to),
      fetchAllMetricsEvents(supabase, user.id),
      supabase
        .from("mcp_tool_call_events")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id),
    ]);

    const { data: grantsData, error: grantsError } = oauthGrantsResult;
    const { data: rawParentEvents, count, error: eventsError } = paginatedResult;
    const metricsData = metricsResult;
    const metricsError = null;

    if (grantsError || eventsError) {
      const errorMsg = grantsError?.message || eventsError?.message;
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

    const mcpAssistantCallsTotal = count ?? 0;
    const exactTotalCalls = totalCountResult?.count ?? mcpAssistantCallsTotal;

    return NextResponse.json({
      connections: connections ?? [],
      grants,
      groups,
      metricsEvents: metricsData ?? [],
      totalCount: exactTotalCalls,
      mcpAssistantCount: mcpAssistantCallsTotal,
      currentPage,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch usage";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
