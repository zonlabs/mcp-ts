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

  const executionLogId = request.nextUrl.searchParams.get("executionLogId");
  if (!executionLogId) {
    return NextResponse.json({ error: "executionLogId is required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("execution_logs")
    .select(
      "id,status,workflow_id,scheduled_workflow_id,job_id,retry_count,input_data,output_data,error_message,error_code,error_stack,started_at,completed_at,duration_ms,created_at"
    )
    .eq("id", executionLogId)
    .eq("user_id", user.id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Execution log not found" }, { status: 404 });
  }

  return NextResponse.json({ executionLog: data });
}
