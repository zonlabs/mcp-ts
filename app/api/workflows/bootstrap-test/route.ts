import { NextRequest, NextResponse } from "next/server";
import { storage } from "@mcp-ts/sdk/server";
import { createClient } from "@/lib/supabase/server";

type SessionData = Awaited<ReturnType<typeof storage.getIdentitySessionsData>>[number];

interface BootstrapBody {
  name?: string;
  toolkit?: string;
  toolSlug?: string;
  toolArguments?: Record<string, unknown>;
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [workflowsResp, schedulesResp, sessionsResp] = await Promise.all([
    supabase
      .from("workflows")
      .select("id,name,is_active,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("scheduled_workflows")
      .select("id,workflow_id,name,status,is_enabled,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("mcp_sessions")
      .select("session_id,server_id,active,created_at")
      .eq("identity", user.id)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  if (workflowsResp.error || schedulesResp.error || sessionsResp.error) {
    return NextResponse.json(
      {
        error:
          workflowsResp.error?.message ||
          schedulesResp.error?.message ||
          sessionsResp.error?.message ||
          "Failed to load test data",
      },
      { status: 500 }
    );
  }

  let runtimeSessions: Array<{
    session_id: string;
    server_id: string | null;
    active: boolean;
    created_at: string | null;
  }> = [];
  try {
    const sessions = await storage.getIdentitySessionsData(user.id);
    runtimeSessions = sessions.map((session: SessionData) => ({
      session_id: String(session.sessionId ?? ""),
      server_id:
        session.serverId === undefined || session.serverId === null
          ? null
          : String(session.serverId),
      active: session.active !== false,
      created_at:
        session.createdAt === undefined || session.createdAt === null
          ? null
          : String(session.createdAt),
    }));
  } catch {
    // If mcp-ts storage lookup fails, we still return DB sessions.
  }

  const preferredSessions = runtimeSessions.length > 0 ? runtimeSessions : sessionsResp.data ?? [];

  return NextResponse.json({
    userId: user.id,
    workflows: workflowsResp.data ?? [],
    schedules: schedulesResp.data ?? [],
    sessions: preferredSessions,
  });
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

  let body: BootstrapBody = {};
  try {
    body = (await request.json()) as BootstrapBody;
  } catch {
    body = {};
  }

  const name = (body.name || "Workflow UI Test").trim();
  const toolkit = (body.toolkit || "custom").trim();
  const toolSlug = (body.toolSlug || "YOUR_REAL_TOOL_NAME").trim();
  const toolArguments = body.toolArguments || { message: "{{params.test_message}}" };

  const workflowInsert = await supabase
    .from("workflows")
    .insert({
      user_id: user.id,
      name,
      description: "Auto-created from /workflow-test",
      workflow: [],
      input_schema: {
        type: "object",
        properties: {
          test_message: { type: "string" },
        },
      },
      output_schema: { type: "object" },
      is_active: true,
    })
    .select("id,name,user_id")
    .single();

  if (workflowInsert.error || !workflowInsert.data) {
    return NextResponse.json(
      { error: `Failed to create workflow: ${workflowInsert.error?.message ?? "Unknown error"}` },
      { status: 500 }
    );
  }

  const workflowId = workflowInsert.data.id as string;

  const scheduleInsert = await supabase
    .from("scheduled_workflows")
    .insert({
      workflow_id: workflowId,
      user_id: user.id,
      name: `${name} Schedule`,
      cron_expression: "*/5 * * * *",
      status: "active",
      is_enabled: true,
      params: { test_message: "hello from bootstrap schedule" },
    })
    .select("id,workflow_id,name")
    .single();

  if (scheduleInsert.error || !scheduleInsert.data) {
    return NextResponse.json(
      { error: `Failed to create schedule: ${scheduleInsert.error?.message ?? "Unknown error"}` },
      { status: 500 }
    );
  }

  const stepInsert = await supabase
    .from("workflow_steps")
    .insert({
      workflow_id: workflowId,
      step_number: 1,
      name: `${name} Step`,
      description: "Auto-created from /workflow-test",
      toolkit,
      tool_slug: toolSlug,
      tool_arguments: toolArguments,
      retry_on_failure: true,
      max_retries: 2,
      timeout_seconds: 60,
    })
    .select("id,toolkit,tool_slug")
    .single();

  if (stepInsert.error || !stepInsert.data) {
    return NextResponse.json(
      { error: `Failed to create step: ${stepInsert.error?.message ?? "Unknown error"}` },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      success: true,
      workflow: workflowInsert.data,
      schedule: scheduleInsert.data,
      step: stepInsert.data,
    },
    { status: 201 }
  );
}

export async function DELETE() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: workflows, error: workflowFetchError } = await supabase
    .from("workflows")
    .select("id")
    .eq("user_id", user.id);

  if (workflowFetchError) {
    return NextResponse.json(
      { error: `Failed to load workflows for cleanup: ${workflowFetchError.message}` },
      { status: 500 }
    );
  }

  const workflowIds = (workflows ?? []).map((item) => item.id as string);

  const deleteExecutionLogs = await supabase
    .from("execution_logs")
    .delete()
    .eq("user_id", user.id);
  if (deleteExecutionLogs.error) {
    return NextResponse.json(
      { error: `Failed to delete execution logs: ${deleteExecutionLogs.error.message}` },
      { status: 500 }
    );
  }

  const deleteSchedules = await supabase
    .from("scheduled_workflows")
    .delete()
    .eq("user_id", user.id);
  if (deleteSchedules.error) {
    return NextResponse.json(
      { error: `Failed to delete schedules: ${deleteSchedules.error.message}` },
      { status: 500 }
    );
  }

  if (workflowIds.length > 0) {
    const deleteSteps = await supabase
      .from("workflow_steps")
      .delete()
      .in("workflow_id", workflowIds);
    if (deleteSteps.error) {
      return NextResponse.json(
        { error: `Failed to delete workflow steps: ${deleteSteps.error.message}` },
        { status: 500 }
      );
    }
  }

  const deleteWorkflows = await supabase.from("workflows").delete().eq("user_id", user.id);
  if (deleteWorkflows.error) {
    return NextResponse.json(
      { error: `Failed to delete workflows: ${deleteWorkflows.error.message}` },
      { status: 500 }
    );
  }

  const deleteSessions = await supabase.from("mcp_sessions").delete().eq("identity", user.id);
  if (deleteSessions.error) {
    return NextResponse.json(
      { error: `Failed to delete mcp sessions: ${deleteSessions.error.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    deleted: {
      execution_logs_for_user: true,
      scheduled_workflows_for_user: true,
      workflow_steps_for_user_workflows: workflowIds.length,
      workflows_for_user: workflowIds.length,
      mcp_sessions_for_identity: true,
    },
    excluded: [],
  });
}
