export type WorkflowStatus = "pending" | "running" | "success" | "failed";
export type TriggeredBy = "manual" | "scheduler" | "webhook";

export interface Workflow {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  toolkits: string[];
  step_count: number;
  schedule_count: number;
  /** Saved defaults for `{{params.*}}` placeholders (DB: defaults_for_required_parameters) */
  default_params?: Record<string, unknown>;
  /** Optional when fetched from detail endpoint */
  scheduled_workflows?: Schedule[];
}

export interface WorkflowStep {
  id: string;
  workflow_id: string;
  step_number: number;
  name: string;
  description: string | null;
  toolkit: string;
  tool_slug: string;
  tool_arguments: Record<string, unknown>;
  run_if_condition: Record<string, unknown> | null;
  depends_on_step_id: string | null;
  retry_on_failure: boolean;
  max_retries: number;
  timeout_seconds: number;
}

export interface Schedule {
  id: string;
  workflow_id: string;
  name: string;
  cron_expression: string;
  status: string;
  is_enabled: boolean;
  params: Record<string, unknown>;
  created_at: string;
}

export interface WorkflowDetail {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  input_schema: Record<string, unknown>;
  output_schema: Record<string, unknown>;
  default_params?: Record<string, unknown>;
  workflow_steps: WorkflowStep[];
  scheduled_workflows: Schedule[];
}

export interface ExecutionLog {
  id: string;
  workflow_id: string;
  scheduled_workflow_id: string | null;
  status: WorkflowStatus;
  triggered_by: TriggeredBy | string;
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
  error_message: string | null;
  error_code: string | null;
  input_data: Record<string, unknown> | null;
  created_at: string;
  workflow?: { name: string; description: string | null } | null;
}

export interface McpSession {
  session_id: string;
  server_id: string | null;
  active: boolean;
  created_at?: string | null;
}
