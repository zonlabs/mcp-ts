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

  // Verify ownership
  const { data: wf } = await supabase
    .from("workflows")
    .select("id")
    .eq("id", workflowId)
    .eq("user_id", user.id)
    .single();

  if (!wf) {
    return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
  }

  const { data: steps, error } = await supabase
    .from("workflow_steps")
    .select("*")
    .eq("workflow_id", workflowId)
    .order("step_number", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ steps: steps ?? [] });
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

  const { data: wf } = await supabase
    .from("workflows")
    .select("id")
    .eq("id", workflowId)
    .eq("user_id", user.id)
    .single();

  if (!wf) {
    return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
  }

  let body: {
    name?: string;
    toolkit?: string;
    tool_slug?: string;
    tool_arguments?: Record<string, unknown>;
    timeout_seconds?: number;
    retry_on_failure?: boolean;
    max_retries?: number;
    description?: string;
  } = {};

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  if (!body.toolkit?.trim()) {
    return NextResponse.json({ error: "toolkit is required" }, { status: 400 });
  }
  if (!body.tool_slug?.trim()) {
    return NextResponse.json({ error: "tool_slug is required" }, { status: 400 });
  }

  // Auto-assign step_number
  const { data: existing } = await supabase
    .from("workflow_steps")
    .select("step_number")
    .eq("workflow_id", workflowId)
    .order("step_number", { ascending: false })
    .limit(1);

  const nextNumber = ((existing?.[0]?.step_number as number) ?? 0) + 1;

  const { data: step, error } = await supabase
    .from("workflow_steps")
    .insert({
      workflow_id: workflowId,
      step_number: nextNumber,
      name: body.name.trim(),
      description: body.description?.trim() ?? null,
      toolkit: body.toolkit.trim(),
      tool_slug: body.tool_slug.trim(),
      tool_arguments: body.tool_arguments ?? {},
      timeout_seconds: body.timeout_seconds ?? 120,
      retry_on_failure: body.retry_on_failure ?? true,
      max_retries: body.max_retries ?? 1,
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ step }, { status: 201 });
}
