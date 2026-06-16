import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getStoredMcpConnectionsForIdentity } from "@/lib/mcp-connections";
import { McpUsageOverview } from "@/components/mcp-usage/McpUsageOverview";
import type { McpToolCallEventRow } from "@/lib/mcp-usage";

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

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function RemoteMcpPage({ searchParams }: PageProps) {
  const resolvedSearchParams = await searchParams;
  const pageStr = typeof resolvedSearchParams.page === "string" ? resolvedSearchParams.page : "1";
  let currentPage = Math.max(1, parseInt(pageStr, 10));
  if (isNaN(currentPage)) {
    currentPage = 1;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/signin?redirect=/remote-mcp");
  }

  const pageSize = 10;
  const from = (currentPage - 1) * pageSize;
  const to = from + pageSize - 1;

  const [connections, paginatedResult, metricsResult] = await Promise.all([
    getStoredMcpConnectionsForIdentity(user.id),
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

  const { data: eventsData, count, error } = paginatedResult;
  const { data: metricsData, error: metricsError } = metricsResult;

  const events = (eventsData ?? []) as unknown as McpToolCallEventRow[];
  const metricsEvents = (metricsData ?? []) as unknown as McpToolCallEventRow[];
  const totalCount = count ?? 0;
  const pageError = error || metricsError;

  return (
    <div className="space-y-6">
      {pageError ? (
        <section className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <p className="font-medium text-destructive">Could not load usage data</p>
          <p className="mt-1 text-muted-foreground">{pageError.message}</p>
        </section>
      ) : (
        <McpUsageOverview
          events={events}
          connections={connections}
          metricsEvents={metricsEvents}
          totalCount={totalCount}
          currentPage={currentPage}
        />
      )}
    </div>
  );
}
