import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  _: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id: workflowId } = await context.params;
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("scheduled_workflows")
    .select("id, name, cron_expression, status, is_enabled, params, created_at")
    .eq("workflow_id", workflowId)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ schedules: data ?? [] });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id: workflowId } = await context.params;
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify workflow ownership
  const { data: workflow } = await supabase
    .from("workflows")
    .select("id")
    .eq("id", workflowId)
    .eq("user_id", user.id)
    .single();

  if (!workflow) {
    return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
  }

  let body: { name?: string; cron_expression?: string; params?: Record<string, unknown>; is_enabled?: boolean } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  if (!body.cron_expression?.trim()) {
    return NextResponse.json({ error: "cron_expression is required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("scheduled_workflows")
    .insert({
      workflow_id: workflowId,
      user_id: user.id,
      name: body.name.trim(),
      cron_expression: body.cron_expression.trim(),
      status: "active",
      is_enabled: body.is_enabled ?? true,
      params: body.params ?? {},
    })
    .select("id, name, cron_expression, status, is_enabled, params, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ schedule: data }, { status: 201 });
}
