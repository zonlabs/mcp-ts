import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string; scheduleId: string }> }
) {
  const { id: workflowId, scheduleId } = await context.params;
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    name?: string;
    cron_expression?: string;
    params?: Record<string, unknown>;
    is_enabled?: boolean;
  } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) patch.name = body.name.trim();
  if (body.cron_expression !== undefined) patch.cron_expression = body.cron_expression.trim();
  if (body.params !== undefined) patch.params = body.params;
  if (body.is_enabled !== undefined) {
    patch.is_enabled = body.is_enabled;
    patch.status = body.is_enabled ? "active" : "paused";
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("scheduled_workflows")
    .update(patch)
    .eq("id", scheduleId)
    .eq("workflow_id", workflowId)
    .eq("user_id", user.id)
    .select("id, name, cron_expression, status, is_enabled, params, created_at")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Update failed" }, { status: 500 });
  }

  return NextResponse.json({ schedule: data });
}

export async function DELETE(
  _: NextRequest,
  context: { params: Promise<{ id: string; scheduleId: string }> }
) {
  const { id: workflowId, scheduleId } = await context.params;
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { error } = await supabase
    .from("scheduled_workflows")
    .delete()
    .eq("id", scheduleId)
    .eq("workflow_id", workflowId)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
