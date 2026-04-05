import type { ExecutionLog, Schedule, Workflow, WorkflowDetail } from "@/types/workflows";

type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string };

async function parseJson<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

function errorFromBody(body: unknown, fallback: string): string {
  if (!body || typeof body !== "object") return fallback;
  const msg = (body as { error?: string }).error;
  return msg ?? fallback;
}

export async function fetchWorkflows(): Promise<ApiResult<Workflow[]>> {
  const res = await fetch("/api/workflows");
  if (!res.ok) return { ok: false, error: "Failed to load workflows" };
  const data = await parseJson<{ workflows?: Workflow[] }>(res);
  return { ok: true, data: data.workflows ?? [] };
}

export async function fetchWorkflowDetail(id: string): Promise<ApiResult<WorkflowDetail>> {
  const res = await fetch(`/api/workflows/${id}`);
  if (!res.ok) return { ok: false, error: "Workflow not found" };
  const data = await parseJson<{ workflow: WorkflowDetail }>(res);
  return { ok: true, data: data.workflow };
}

export async function fetchHistoryList(limit = 50): Promise<ApiResult<ExecutionLog[]>> {
  const res = await fetch(`/api/workflows/history?limit=${limit}`);
  if (!res.ok) return { ok: false, error: "Failed to load history" };
  const data = await parseJson<{ logs?: ExecutionLog[] }>(res);
  return { ok: true, data: data.logs ?? [] };
}

export async function fetchWorkflowHistory(id: string, limit = 20): Promise<ApiResult<ExecutionLog[]>> {
  const res = await fetch(`/api/workflows/history?workflowId=${id}&limit=${limit}`);
  if (!res.ok) return { ok: false, error: "Failed to load workflow history" };
  const data = await parseJson<{ logs?: ExecutionLog[] }>(res);
  return { ok: true, data: data.logs ?? [] };
}

export async function updateWorkflow(
  id: string,
  payload: Record<string, unknown>
): Promise<ApiResult<{ workflow?: WorkflowDetail }>> {
  const res = await fetch(`/api/workflows/${id}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await parseJson<{ workflow?: WorkflowDetail; error?: string }>(res).catch(
    () => ({}) as { workflow?: WorkflowDetail; error?: string }
  );
  if (!res.ok) return { ok: false, error: errorFromBody(body, "Update failed") };
  return { ok: true, data: { workflow: body.workflow } };
}

export async function deleteWorkflow(id: string): Promise<ApiResult<null>> {
  const res = await fetch(`/api/workflows/${id}`, { method: "DELETE" });
  if (!res.ok) return { ok: false, error: "Failed to delete workflow" };
  return { ok: true, data: null };
}

export async function fetchSchedules(id: string): Promise<ApiResult<Schedule[]>> {
  const res = await fetch(`/api/workflows/${id}/schedules`);
  if (!res.ok) return { ok: false, error: "Failed to load schedules" };
  const data = await parseJson<{ schedules?: Schedule[] }>(res);
  return { ok: true, data: data.schedules ?? [] };
}

export async function createSchedule(
  id: string,
  payload: { name: string; cron_expression: string; params: Record<string, unknown>; is_enabled: boolean }
): Promise<ApiResult<Schedule>> {
  const res = await fetch(`/api/workflows/${id}/schedules`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await parseJson<{ schedule?: Schedule; error?: string }>(res).catch(
    () => ({}) as { schedule?: Schedule; error?: string }
  );
  if (!res.ok || !body.schedule) return { ok: false, error: errorFromBody(body, "Failed to save schedule") };
  return { ok: true, data: body.schedule };
}

export async function updateSchedule(
  id: string,
  scheduleId: string,
  payload: { name?: string; cron_expression?: string; params?: Record<string, unknown>; is_enabled?: boolean }
): Promise<ApiResult<Schedule>> {
  const res = await fetch(`/api/workflows/${id}/schedules/${scheduleId}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await parseJson<{ schedule?: Schedule; error?: string }>(res).catch(
    () => ({}) as { schedule?: Schedule; error?: string }
  );
  if (!res.ok || !body.schedule) return { ok: false, error: errorFromBody(body, "Failed to save schedule") };
  return { ok: true, data: body.schedule };
}

export async function deleteSchedule(id: string, scheduleId: string): Promise<ApiResult<null>> {
  const res = await fetch(`/api/workflows/${id}/schedules/${scheduleId}`, { method: "DELETE" });
  if (!res.ok) return { ok: false, error: "Failed to delete schedule" };
  return { ok: true, data: null };
}
