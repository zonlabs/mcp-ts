import { NextRequest, NextResponse } from "next/server";
import { Queue } from "bullmq";
import { createClient } from "@/lib/supabase/server";
import { createWorkflowRedisConnection } from "@/lib/workflow-redis";

type TriggeredBy = "manual" | "scheduler" | "webhook";

interface EnqueueWorkflowRequest {
  workflowId: string;
  scheduledWorkflowId: string;
  sessionId: string;
  params?: Record<string, unknown>;
  triggeredBy?: TriggeredBy;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
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

  let body: EnqueueWorkflowRequest;
  try {
    body = (await request.json()) as EnqueueWorkflowRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { workflowId, scheduledWorkflowId, sessionId } = body;
  const params = body.params ?? {};
  const triggeredBy = body.triggeredBy ?? "manual";

  if (!isNonEmptyString(workflowId)) {
    return NextResponse.json({ error: "workflowId is required" }, { status: 400 });
  }
  if (!isNonEmptyString(scheduledWorkflowId)) {
    return NextResponse.json({ error: "scheduledWorkflowId is required" }, { status: 400 });
  }
  if (!isNonEmptyString(sessionId)) {
    return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  }

  const { data: workflow, error: workflowError } = await supabase
    .from("workflows")
    .select("id,user_id,is_active")
    .eq("id", workflowId)
    .eq("user_id", user.id)
    .single();

  if (workflowError || !workflow) {
    return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
  }

  if (!workflow.is_active) {
    return NextResponse.json({ error: "Workflow is inactive" }, { status: 400 });
  }

  const { data: schedule, error: scheduleError } = await supabase
    .from("scheduled_workflows")
    .select("id,user_id,workflow_id,is_enabled,status")
    .eq("id", scheduledWorkflowId)
    .eq("user_id", user.id)
    .eq("workflow_id", workflowId)
    .single();

  if (scheduleError || !schedule) {
    return NextResponse.json({ error: "Scheduled workflow not found" }, { status: 404 });
  }

  if (!schedule.is_enabled || schedule.status !== "active") {
    return NextResponse.json({ error: "Scheduled workflow is not active" }, { status: 400 });
  }

  const { data: executionLog, error: executionError } = await supabase
    .from("execution_logs")
    .insert({
      scheduled_workflow_id: scheduledWorkflowId,
      workflow_id: workflowId,
      user_id: user.id,
      status: "pending",
      input_data: params,
      triggered_by: triggeredBy,
      retry_count: 0,
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (executionError || !executionLog) {
    return NextResponse.json(
      { error: `Failed to create execution log: ${executionError?.message ?? "Unknown error"}` },
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
        triggeredBy,
        params,
      },
      {
        jobId,
        attempts: Number(process.env.WORKER_MAX_ATTEMPTS ?? "3"),
        backoff: {
          type: "exponential",
          delay: Number(process.env.WORKER_BACKOFF_DELAY ?? "5000"),
        },
      }
    );

    await supabase
      .from("execution_logs")
      .update({ job_id: job.id?.toString() ?? jobId })
      .eq("id", executionLogId);

    return NextResponse.json(
      {
        success: true,
        executionLogId,
        jobId: job.id ?? jobId,
        queueName: "workflow-executions",
      },
      { status: 202 }
    );
  } catch (queueError) {
    const queueErrorMessage =
      queueError instanceof Error ? queueError.message : "Queue enqueue failed";
    const queueErrorCode =
      queueError instanceof Error && "code" in queueError
        ? String((queueError as Error & { code?: unknown }).code ?? "QUEUE_ENQUEUE_FAILED")
        : "QUEUE_ENQUEUE_FAILED";

    console.error("[workflows/enqueue] enqueue failed", {
      executionLogId,
      workflowId,
      scheduledWorkflowId,
      queueErrorMessage,
      queueErrorCode,
    });

    await supabase
      .from("execution_logs")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        error_message: queueErrorMessage,
        error_code: queueErrorCode,
      })
      .eq("id", executionLogId);

    return NextResponse.json(
      {
        error: "Failed to enqueue workflow",
        details: queueErrorMessage,
        code: queueErrorCode,
      },
      { status: 500 }
    );
  } finally {
    await queue.close();
    redis.disconnect();
  }
}
