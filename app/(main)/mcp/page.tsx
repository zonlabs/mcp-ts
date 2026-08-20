import McpPageClient from "./McpPageClient";
import { createClient } from "@/lib/supabase/server";
import { listMcpServersCatalog, SERVER_SELECT } from "@/lib/mcp-servers/service";
import { restMcpServer } from "@/lib/mcp-servers/rest-serialize";
import { UserSession } from "@/components/providers/AuthProvider";
import { mapServerRow } from "@/lib/mcp-servers/types";
import { McpServer } from "@/types/mcp";
import { redirect } from "next/navigation";

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

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

  // Only SSR the things the client can't trivially fetch itself:
  // 1. The selected server (needed for deep-link rendering before client hydrates)
  // 2. Usage data (dashboard metrics)
  const [matchedServerResult, usageResult] = await Promise.allSettled([
    serverId
      ? supabase
          .from("mcp_servers")
          .select(SERVER_SELECT)
          .eq("id", serverId)
          .maybeSingle()
      : Promise.resolve(null),
    fetchServerUsageData(supabase, user.id),
  ]);

  let serversideSelectedServer: McpServer | null = null;

  if (
    serverId &&
    matchedServerResult.status === "fulfilled" &&
    (matchedServerResult.value as any)?.data
  ) {
    const matchedNode = mapServerRow((matchedServerResult.value as any).data);
    serversideSelectedServer = restMcpServer(matchedNode, {
      includeHeaders: true,
      includeCredentials: matchedNode.owner === user.id,
    });
  }

  const initialUsageData =
    usageResult.status === "fulfilled" ? usageResult.value : null;

  return (
    <McpPageClient
      userSession={userSession}
      initialSelectedServer={serversideSelectedServer}
      initialUsageData={initialUsageData}
    />
  );
}

// ── Usage data helpers ────────────────────────────────────────────────────────

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
      .select(
        "started_at,status,app_key,server_id,server_name,server_url,server_icons,event_type"
      )
      .eq("user_id", userId)
      .order("completed_at", { ascending: false })
      .order("event_type", { ascending: false })
      .range(from, to);

    if (error) throw error;
    if (!data || data.length === 0) break;
    allEvents.push(...data);
    if (data.length < METRICS_PAGE_SIZE) break;
    page++;
  }

  return allEvents;
}

async function fetchServerUsageData(supabase: any, userId: string) {
  try {
    const [paginatedResult, metricsResult] = await Promise.all([
      supabase
        .from("mcp_tool_call_events")
        .select(SELECT_COLUMNS, { count: "exact" })
        .eq("user_id", userId)
        .eq("event_type", "top_level")
        .order("completed_at", { ascending: false })
        .range(0, 9),
      fetchAllMetricsEvents(supabase, userId),
    ]);

    const parentEvents = (paginatedResult.data ?? []) as any[];
    const requestIds = [
      ...new Set(parentEvents.map((e) => e.request_id)),
    ].filter(Boolean);
    let children: any[] = [];
    if (requestIds.length > 0) {
      const { data: childData } = await supabase
        .from("mcp_tool_call_events")
        .select(SELECT_COLUMNS)
        .eq("user_id", userId)
        .in("request_id", requestIds)
        .neq("event_type", "top_level")
        .order("started_at", { ascending: true });
      children = childData ?? [];
    }

    const childrenByRequestId = new Map<string, any[]>();
    for (const child of children) {
      const rid = child.request_id;
      const existing = childrenByRequestId.get(rid) ?? [];
      existing.push(child);
      childrenByRequestId.set(rid, existing);
    }

    const groups = parentEvents.map((parent) => ({
      parent,
      children: childrenByRequestId.get(parent.request_id) ?? [],
    }));

    return {
      groups,
      metricsEvents: metricsResult ?? [],
      totalCount: paginatedResult.count ?? 0,
      currentPage: 1,
    };
  } catch (err) {
    console.error("Failed to fetch server usage data:", err);
    return null;
  }
}
