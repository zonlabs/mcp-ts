import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sp = request.nextUrl.searchParams;
  const limit = Math.min(Number(sp.get("limit") ?? "50"), 100);
  const offset = Number(sp.get("offset") ?? "0");
  const workflowId = sp.get("workflowId");

  let query = supabase
    .from("execution_logs")
    .select(
      "id, workflow_id, scheduled_workflow_id, status, triggered_by, started_at, completed_at, duration_ms, error_message, error_code, input_data, created_at",
      { count: "exact" }
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (workflowId) {
    query = query.eq("workflow_id", workflowId);
  }

  const { data: logs, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Enrich with workflow names in a single batch query
  const workflowIds = [...new Set((logs ?? []).map((l) => l.workflow_id as string))];
  let workflowMap: Record<string, { name: string; description: string | null }> = {};

  if (workflowIds.length > 0) {
    const { data: workflows } = await supabase
      .from("workflows")
      .select("id, name, description")
      .in("id", workflowIds);

    workflowMap = Object.fromEntries(
      (workflows ?? []).map((w) => [w.id, { name: w.name, description: w.description }])
    );
  }

  const enriched = (logs ?? []).map((log) => ({
    ...log,
    workflow: workflowMap[log.workflow_id as string] ?? null,
  }));

  return NextResponse.json({ logs: enriched, total: count ?? 0 });
}
