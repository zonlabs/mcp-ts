import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

async function verifyOwnership(workflowId: string) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) return { supabase, user: null };

  const { data: wf } = await supabase
    .from("workflows")
    .select("id")
    .eq("id", workflowId)
    .eq("user_id", user.id)
    .single();

  return { supabase, user: wf ? user : null };
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string; stepId: string }> }
) {
  try {
    const { id: workflowId, stepId } = await context.params;
    const { supabase, user } = await verifyOwnership(workflowId);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized or not found" }, { status: 401 });
    }

    let body: {
      name?: string;
      toolkit?: string;
      tool_slug?: string;
      tool_arguments?: Record<string, unknown>;
      timeout_seconds?: number;
      retry_on_failure?: boolean;
      max_retries?: number;
      step_number?: number;
      description?: string;
    } = {};

    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const patch: Record<string, unknown> = {};
    if (body.name !== undefined) patch.name = body.name.trim();
    if (body.description !== undefined) patch.description = body.description?.trim() ?? null;
    if (body.toolkit !== undefined) patch.toolkit = body.toolkit.trim();
    if (body.tool_slug !== undefined) patch.tool_slug = body.tool_slug.trim();
    if (body.tool_arguments !== undefined) patch.tool_arguments = body.tool_arguments;
    if (body.timeout_seconds !== undefined) patch.timeout_seconds = body.timeout_seconds;
    if (body.retry_on_failure !== undefined) patch.retry_on_failure = body.retry_on_failure;
    if (body.max_retries !== undefined) patch.max_retries = body.max_retries;
    if (body.step_number !== undefined) patch.step_number = body.step_number;

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    const { data: step, error } = await supabase
      .from("workflow_steps")
      .update(patch)
      .eq("id", stepId)
      .eq("workflow_id", workflowId)
      .select("*")
      .single();

    if (error || !step) {
      return NextResponse.json({ error: error?.message ?? "Step not found" }, { status: 500 });
    }

    return NextResponse.json({ step });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(
  _: NextRequest,
  context: { params: Promise<{ id: string; stepId: string }> }
) {
  try {
    const { id: workflowId, stepId } = await context.params;
    const { supabase, user } = await verifyOwnership(workflowId);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized or not found" }, { status: 401 });
    }

    const { error } = await supabase
      .from("workflow_steps")
      .delete()
      .eq("id", stepId)
      .eq("workflow_id", workflowId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const { data: remaining } = await supabase
      .from("workflow_steps")
      .select("id, step_number")
      .eq("workflow_id", workflowId)
      .order("step_number", { ascending: true });

    if (remaining && remaining.length > 0) {
      await Promise.all(
        remaining.map((s, idx) =>
          supabase
            .from("workflow_steps")
            .update({ step_number: idx + 1 })
            .eq("id", s.id)
        )
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
