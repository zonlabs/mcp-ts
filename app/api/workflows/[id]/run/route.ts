import { NextRequest, NextResponse } from "next/server";
import { Queue } from "bullmq";
import { createClient } from "@/lib/supabase/server";
import { createWorkflowRedisConnection } from "@/lib/workflow-redis";
import { sessions } from "@mcp-ts/sdk/server";

type SessionData = Awaited<ReturnType<typeof sessions.list>>[number];

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

  const { data: workflow, error: wfError } = await supabase
    .from("workflows")
    .select("id, is_active, name")
    .eq("id", workflowId)
    .eq("user_id", user.id)
    .single();

  if (wfError || !workflow) {
    return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
  }

  if (!workflow.is_active) {
    return NextResponse.json({ error: "Workflow is inactive" }, { status: 400 });
  }

  let body: { sessionId?: string; scheduledWorkflowId?: string; params?: Record<string, unknown> } =
    {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  // Resolve session ID
  let sessionId = body.sessionId?.trim();
  if (!sessionId) {
    try {
      const userSessions = await sessions.list(user.id);
      const active = userSessions.find((s: SessionData) => (s as unknown as Record<string, unknown>).active !== false);
      if (active) sessionId = String(active.sessionId ?? "");
    } catch {
      // fall through to DB lookup
    }
  }
  if (!sessionId) {
    const { data: dbSession } = await supabase
      .from("mcp_sessions")
      .select("session_id")
      .eq("identity", user.id)
      .eq("active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    sessionId = dbSession?.session_id;
  }

  if (!sessionId) {
    return NextResponse.json(
      { error: "No active MCP session found. Connect an MCP server first." },
      { status: 400 }
    );
  }

  // Resolve schedule ID
  let scheduledWorkflowId = body.scheduledWorkflowId?.trim();
  if (!scheduledWorkflowId) {
    const { data: schedule } = await supabase
      .from("scheduled_workflows")
      .select("id")
      .eq("workflow_id", workflowId)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    scheduledWorkflowId = schedule?.id;
  }

  if (!scheduledWorkflowId) {
    return NextResponse.json(
      { error: "No schedule found. Add a schedule to this workflow before running." },
      { status: 400 }
    );
  }

  const runParams = body.params ?? {};

  const { data: executionLog, error: logError } = await supabase
    .from("execution_logs")
    .insert({
      workflow_id: workflowId,
      scheduled_workflow_id: scheduledWorkflowId,
      user_id: user.id,
      status: "pending",
      input_data: runParams,
      triggered_by: "manual",
      retry_count: 0,
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (logError || !executionLog) {
    return NextResponse.json(
      { error: `Failed to create execution log: ${logError?.message}` },
      { status: 500 }
    );
  }

  const executionLogId = executionLog.id as string;
  const jobId = `execution-${executionLogId}`;
  const redis = createWorkflowRedisConnection();
  const queue = new Queue("workflow-executions", { connection: redis });

  try {
    const job = await queue.add(
      "execute-workflow",
      {
        workflowId,
        scheduledWorkflowId,
        executionLogId,
        userId: user.id,
        sessionId,
        triggeredBy: "manual",
        params: runParams,
      },
      {
        jobId,
        attempts: Number(process.env.WORKER_MAX_ATTEMPTS ?? "3"),
        backoff: { type: "exponential", delay: 5000 },
      }
    );

    await supabase
      .from("execution_logs")
      .update({ job_id: job.id?.toString() ?? jobId })
      .eq("id", executionLogId);

    return NextResponse.json({ success: true, executionLogId, jobId: job.id ?? jobId }, { status: 202 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Queue error";
    await supabase
      .from("execution_logs")
      .update({ status: "failed", error_message: msg, completed_at: new Date().toISOString() })
      .eq("id", executionLogId);
    return NextResponse.json({ error: "Failed to enqueue", details: msg }, { status: 500 });
  } finally {
    await queue.close();
    redis.disconnect();
  }
}
