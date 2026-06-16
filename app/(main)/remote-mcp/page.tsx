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

export default async function RemoteMcpPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/signin?redirect=/remote-mcp");
  }

  const [connections, { data, error }] = await Promise.all([
    getStoredMcpConnectionsForIdentity(user.id),
    supabase
      .from("mcp_tool_call_events")
      .select(SELECT_COLUMNS)
      .eq("user_id", user.id)
      .order("started_at", { ascending: false })
      .limit(1000),
  ]);

  const events = (data ?? []) as unknown as McpToolCallEventRow[];

  return (
    <div className="space-y-6">
      {error ? (
        <section className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <p className="font-medium text-destructive">Could not load usage data</p>
          <p className="mt-1 text-muted-foreground">{error.message}</p>
        </section>
      ) : (
        <McpUsageOverview events={events} connections={connections} />
      )}
    </div>
  );
}
