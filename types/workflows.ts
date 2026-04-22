export type WorkflowStatus = "pending" | "running" | "success" | "failed";
export type TriggeredBy = "manual" | "scheduler" | "webhook";

export interface Workflow {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  toolkit_ids: string[];
  schedule_count: number;
  /** Saved defaults for `{{params.*}}` placeholders (DB: defaults_for_required_parameters) */
  default_params?: Record<string, unknown>;
  /** Optional when fetched from detail endpoint */
  scheduled_workflows?: Schedule[];
  /** Script content */
  script_code?: string | null;
  script_runtime?: Record<string, unknown> | null;
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
  script_code: string | null;
  script_runtime: Record<string, unknown> | null;
  toolkit_ids: string[];
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
