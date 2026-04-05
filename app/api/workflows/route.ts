import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: workflows, error } = await supabase
    .from("workflows")
    .select(
      "id, name, description, is_active, created_at, defaults_for_required_parameters, workflow_steps(toolkit), scheduled_workflows(id)"
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  type RawRow = {
    id: string;
    name: string;
    description: string | null;
    is_active: boolean;
    created_at: string;
    defaults_for_required_parameters: Record<string, unknown> | null;
    workflow_steps: Array<{ toolkit: string }>;
    scheduled_workflows: Array<{ id: string }>;
  };

  const result = (workflows as RawRow[]).map((w) => ({
    id: w.id,
    name: w.name,
    description: w.description,
    is_active: w.is_active,
    created_at: w.created_at,
    default_params: w.defaults_for_required_parameters ?? {},
    toolkits: [...new Set(w.workflow_steps.map((s) => s.toolkit))],
    step_count: w.workflow_steps.length,
    schedule_count: w.scheduled_workflows.length,
  }));

  return NextResponse.json({ workflows: result });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { name?: string; description?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("workflows")
    .insert({
      user_id: user.id,
      name: body.name.trim(),
      description: body.description?.trim() ?? null,
      workflow: [],
      input_schema: { type: "object", properties: {} },
      output_schema: { type: "object" },
      is_active: true,
    })
    .select("id, name, description, is_active, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    {
      workflow: {
        ...data,
        toolkits: [],
        step_count: 0,
        schedule_count: 0,
      },
    },
    { status: 201 }
  );
}
