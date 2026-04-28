import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  _: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: workflow, error } = await supabase
    .from("workflows")
    .select(
      `id, name, description, is_active, created_at, input_schema, output_schema, defaults_for_required_parameters, 
       script_code, script_runtime, toolkit_ids,
       scheduled_workflows(id, name, cron_expression, status, is_enabled, params, created_at)`
    )
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (error || !workflow) {
    return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
  }

  const wf = workflow as Record<string, unknown>;
  const defaultParams = (wf.defaults_for_required_parameters as Record<string, unknown>) ?? {};
  const { defaults_for_required_parameters: _d, ...rest } = wf;

  return NextResponse.json({
    workflow: {
      ...rest,
      default_params: defaultParams,
    },
  });
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
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
    description?: string;
    is_active?: boolean;
    default_params?: Record<string, unknown>;
    script_code?: string;
    script_runtime?: Record<string, unknown>;
    toolkit_ids?: string[];
  } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) patch.name = body.name.trim();
  if (body.description !== undefined) patch.description = body.description?.trim() ?? null;
  if (body.is_active !== undefined) patch.is_active = body.is_active;
  if (body.script_code !== undefined) patch.script_code = body.script_code;
  if (body.script_runtime !== undefined) patch.script_runtime = body.script_runtime;
  if (body.toolkit_ids !== undefined) patch.toolkit_ids = body.toolkit_ids;
  if (body.default_params !== undefined) {
    const p = body.default_params;
    if (typeof p !== "object" || p === null || Array.isArray(p)) {
      return NextResponse.json(
        { error: "default_params must be a JSON object" },
        { status: 400 }
       );
    }
    patch.defaults_for_required_parameters = p;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("workflows")
    .update(patch)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id, name, description, is_active, created_at, defaults_for_required_parameters, script_code, script_runtime, toolkit_ids")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Update failed" }, { status: 500 });
  }

  const row = data as {
    id: string;
    name: string;
    description: string | null;
    is_active: boolean;
    created_at: string;
    defaults_for_required_parameters: Record<string, unknown> | null;
    script_code: string | null;
    script_runtime: Record<string, unknown> | null;
    toolkit_ids: string[];
  };

  return NextResponse.json({
    workflow: {
      id: row.id,
      name: row.name,
      description: row.description,
      is_active: row.is_active,
      created_at: row.created_at,
      default_params: row.defaults_for_required_parameters ?? {},
      script_code: row.script_code,
      script_runtime: row.script_runtime,
      toolkit_ids: row.toolkit_ids ?? [],
    },
  });
}

export async function DELETE(
  _: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Cascade delete in dependency order
  await supabase.from("execution_logs").delete().eq("workflow_id", id).eq("user_id", user.id);
  await supabase.from("scheduled_workflows").delete().eq("workflow_id", id).eq("user_id", user.id);

  const { error } = await supabase
    .from("workflows")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
