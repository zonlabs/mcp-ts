"use client";

import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type ApiResult = {
  status: number;
  body: unknown;
};

interface BootstrapData {
  userId: string;
  workflows: Array<{ id: string; name: string }>;
  schedules: Array<{ id: string; workflow_id: string; name: string }>;
  sessions: Array<{ session_id: string; server_id: string; active: boolean }>;
}

export default function WorkflowTestPage() {
  const [workflowId, setWorkflowId] = useState("");
  const [scheduledWorkflowId, setScheduledWorkflowId] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [triggeredBy, setTriggeredBy] = useState("manual");
  const [paramsJson, setParamsJson] = useState("{\n  \"test_message\": \"hello from workflow test ui\"\n}");
  const [loading, setLoading] = useState(false);
  const [bootstrapLoading, setBootstrapLoading] = useState(false);
  const [fetchingData, setFetchingData] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ApiResult | null>(null);
  const [bootstrapResult, setBootstrapResult] = useState<ApiResult | null>(null);
  const [bootstrapData, setBootstrapData] = useState<BootstrapData | null>(null);
  const [executionLogIdInput, setExecutionLogIdInput] = useState("");
  const [tracking, setTracking] = useState(false);
  const [executionStatusResult, setExecutionStatusResult] = useState<ApiResult | null>(null);
  const [bootstrapName, setBootstrapName] = useState("Workflow UI Test");
  const [bootstrapToolkit, setBootstrapToolkit] = useState("custom");
  const [bootstrapToolSlug, setBootstrapToolSlug] = useState("YOUR_REAL_TOOL_NAME");
  const [bootstrapArgsJson, setBootstrapArgsJson] = useState(
    "{\n  \"message\": \"{{params.test_message}}\"\n}"
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setResult(null);

    let parsedParams: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(paramsJson);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("params must be a JSON object");
      }
      parsedParams = parsed as Record<string, unknown>;
    } catch (parseError) {
      setError(parseError instanceof Error ? parseError.message : "Invalid params JSON");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/workflows/enqueue", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          workflowId,
          scheduledWorkflowId,
          sessionId,
          triggeredBy,
          params: parsedParams,
        }),
      });

      const body = (await response.json()) as unknown;
      setResult({
        status: response.status,
        body,
      });
      if (
        response.ok &&
        body &&
        typeof body === "object" &&
        "executionLogId" in body &&
        typeof (body as { executionLogId?: unknown }).executionLogId === "string"
      ) {
        setExecutionLogIdInput((body as { executionLogId: string }).executionLogId);
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }

  async function fetchExecutionStatus(logId: string) {
    const response = await fetch(
      `/api/workflows/execution-log?executionLogId=${encodeURIComponent(logId)}`,
      { method: "GET" }
    );
    const body = (await response.json()) as unknown;
    setExecutionStatusResult({
      status: response.status,
      body,
    });
    return { ok: response.ok, body };
  }

  async function handleFetchExecutionStatus() {
    if (!executionLogIdInput.trim()) {
      setError("executionLogId is required to fetch status");
      return;
    }
    setError(null);
    await fetchExecutionStatus(executionLogIdInput.trim());
  }

  async function handleAutoTrack() {
    if (!executionLogIdInput.trim()) {
      setError("executionLogId is required to track status");
      return;
    }
    setError(null);
    setTracking(true);
    const terminalStatuses = new Set(["success", "failed", "timeout", "cancelled"]);

    try {
      for (let i = 0; i < 20; i += 1) {
        const { ok, body } = await fetchExecutionStatus(executionLogIdInput.trim());
        if (!ok) {
          break;
        }
        const current = body as { executionLog?: { status?: string } } | undefined;
        const status = current?.executionLog?.status;
        if (status && terminalStatuses.has(status)) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    } finally {
      setTracking(false);
    }
  }

  async function handleFetchTestData() {
    setFetchingData(true);
    setError(null);
    try {
      const response = await fetch("/api/workflows/bootstrap-test", {
        method: "GET",
      });
      const body = (await response.json()) as BootstrapData | { error?: string };
      if (!response.ok) {
        throw new Error((body as { error?: string }).error || "Failed to fetch data");
      }

      const data = body as BootstrapData;
      setBootstrapData(data);
      if (data.workflows.length > 0 && !workflowId) {
        setWorkflowId(data.workflows[0].id);
      }
      if (data.schedules.length > 0 && !scheduledWorkflowId) {
        setScheduledWorkflowId(data.schedules[0].id);
      }
      const activeSession = data.sessions.find((session) => session.active);
      if (activeSession && !sessionId) {
        setSessionId(activeSession.session_id);
      }
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Failed to fetch test data");
    } finally {
      setFetchingData(false);
    }
  }

  async function handleBootstrapCreate() {
    setBootstrapLoading(true);
    setError(null);
    setBootstrapResult(null);

    let parsedArguments: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(bootstrapArgsJson);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Bootstrap tool arguments must be a JSON object");
      }
      parsedArguments = parsed as Record<string, unknown>;
    } catch (parseError) {
      setError(parseError instanceof Error ? parseError.message : "Invalid bootstrap arguments");
      setBootstrapLoading(false);
      return;
    }

    try {
      const response = await fetch("/api/workflows/bootstrap-test", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          name: bootstrapName,
          toolkit: bootstrapToolkit,
          toolSlug: bootstrapToolSlug,
          toolArguments: parsedArguments,
        }),
      });
      const body = (await response.json()) as unknown;
      setBootstrapResult({
        status: response.status,
        body,
      });
      if (response.ok) {
        await handleFetchTestData();
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Bootstrap create failed");
    } finally {
      setBootstrapLoading(false);
    }
  }

  async function handleDeleteAllWorkflowData() {
    const confirmed = window.confirm(
      "Delete ALL your workflow test data and MCP sessions (workflows, schedules, steps, execution logs, mcp_sessions)?"
    );
    if (!confirmed) {
      return;
    }

    setBootstrapLoading(true);
    setError(null);
    setBootstrapResult(null);
    try {
      const response = await fetch("/api/workflows/bootstrap-test", {
        method: "DELETE",
      });
      const body = (await response.json()) as unknown;
      setBootstrapResult({
        status: response.status,
        body,
      });
      if (response.ok) {
        setWorkflowId("");
        setScheduledWorkflowId("");
        setResult(null);
        setExecutionStatusResult(null);
        await handleFetchTestData();
      }
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Delete failed");
    } finally {
      setBootstrapLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      <div className="container mx-auto max-w-3xl px-6 py-8">
        <Card>
          <CardHeader>
            <CardTitle>Workflow Enqueue Test (Temporary)</CardTitle>
            <CardDescription>
              Use this temporary page to enqueue a workflow execution without DevTools.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="rounded-md border bg-muted/20 p-3 space-y-3">
                <p className="text-sm font-medium">Data Helper</p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleFetchTestData}
                    disabled={fetchingData}
                  >
                    {fetchingData ? "Loading..." : "Load My IDs"}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleBootstrapCreate}
                    disabled={bootstrapLoading}
                  >
                    {bootstrapLoading ? "Creating..." : "Bootstrap Workflow+Schedule+Step"}
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={handleDeleteAllWorkflowData}
                    disabled={bootstrapLoading}
                  >
                    {bootstrapLoading ? "Working..." : "Delete My Workflow Data"}
                  </Button>
                </div>

                <div className="grid gap-2 md:grid-cols-3">
                  <Input
                    value={bootstrapName}
                    onChange={(event) => setBootstrapName(event.target.value)}
                    placeholder="Bootstrap workflow name"
                  />
                  <Input
                    value={bootstrapToolkit}
                    onChange={(event) => setBootstrapToolkit(event.target.value)}
                    placeholder="Toolkit (e.g. github)"
                  />
                  <Input
                    value={bootstrapToolSlug}
                    onChange={(event) => setBootstrapToolSlug(event.target.value)}
                    placeholder="Tool slug"
                  />
                </div>
                <Textarea
                  value={bootstrapArgsJson}
                  onChange={(event) => setBootstrapArgsJson(event.target.value)}
                  className="min-h-24 font-mono text-xs"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Workflow ID</label>
                <Input
                  value={workflowId}
                  onChange={(event) => setWorkflowId(event.target.value)}
                  placeholder="workflow uuid"
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Scheduled Workflow ID</label>
                <Input
                  value={scheduledWorkflowId}
                  onChange={(event) => setScheduledWorkflowId(event.target.value)}
                  placeholder="scheduled workflow uuid"
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">MCP Session ID</label>
                <Input
                  value={sessionId}
                  onChange={(event) => setSessionId(event.target.value)}
                  placeholder="mcp session id"
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Triggered By</label>
                <Input
                  value={triggeredBy}
                  onChange={(event) => setTriggeredBy(event.target.value)}
                  placeholder="manual"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Params JSON</label>
                <Textarea
                  value={paramsJson}
                  onChange={(event) => setParamsJson(event.target.value)}
                  className="min-h-40 font-mono text-xs"
                />
              </div>

              <Button type="submit" disabled={loading}>
                {loading ? "Enqueuing..." : "Enqueue Workflow"}
              </Button>
            </form>

            {error ? (
              <div className="mt-4 rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-700">
                {error}
              </div>
            ) : null}

            {result ? (
              <div className="mt-4 space-y-2">
                <p className="text-sm font-medium">Response Status: {result.status}</p>
                <Textarea
                  readOnly
                  value={JSON.stringify(result.body, null, 2)}
                  className="min-h-40 font-mono text-xs"
                />
              </div>
            ) : null}

            <div className="mt-4 rounded-md border p-3 space-y-3">
              <p className="text-sm font-medium">Execution Status Tracker</p>
              <div className="flex gap-2">
                <Input
                  value={executionLogIdInput}
                  onChange={(event) => setExecutionLogIdInput(event.target.value)}
                  placeholder="execution log id"
                />
                <Button type="button" variant="outline" onClick={handleFetchExecutionStatus}>
                  Fetch Status
                </Button>
                <Button type="button" variant="secondary" onClick={handleAutoTrack} disabled={tracking}>
                  {tracking ? "Tracking..." : "Auto Track"}
                </Button>
              </div>
              {executionStatusResult ? (
                <Textarea
                  readOnly
                  value={JSON.stringify(executionStatusResult.body, null, 2)}
                  className="min-h-36 font-mono text-xs"
                />
              ) : null}
            </div>

            {bootstrapResult ? (
              <div className="mt-4 space-y-2">
                <p className="text-sm font-medium">Bootstrap Status: {bootstrapResult.status}</p>
                <Textarea
                  readOnly
                  value={JSON.stringify(bootstrapResult.body, null, 2)}
                  className="min-h-28 font-mono text-xs"
                />
              </div>
            ) : null}

            {bootstrapData ? (
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <div className="rounded-md border p-3">
                  <p className="text-sm font-medium mb-1">Workflows</p>
                  <p className="text-xs text-muted-foreground mb-2">{bootstrapData.workflows.length} found</p>
                  <div className="space-y-1">
                    {bootstrapData.workflows.slice(0, 5).map((workflow) => (
                      <button
                        key={workflow.id}
                        type="button"
                        className="w-full rounded border px-2 py-1 text-left text-xs hover:bg-muted"
                        onClick={() => setWorkflowId(workflow.id)}
                      >
                        {workflow.name} - {workflow.id}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-sm font-medium mb-1">Schedules</p>
                  <p className="text-xs text-muted-foreground mb-2">{bootstrapData.schedules.length} found</p>
                  <div className="space-y-1">
                    {bootstrapData.schedules.slice(0, 5).map((schedule) => (
                      <button
                        key={schedule.id}
                        type="button"
                        className="w-full rounded border px-2 py-1 text-left text-xs hover:bg-muted"
                        onClick={() => setScheduledWorkflowId(schedule.id)}
                      >
                        {schedule.name} - {schedule.id}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-sm font-medium mb-1">MCP Sessions</p>
                  <p className="text-xs text-muted-foreground mb-2">{bootstrapData.sessions.length} found</p>
                  <div className="space-y-1">
                    {bootstrapData.sessions.slice(0, 5).map((session) => (
                      <button
                        key={session.session_id}
                        type="button"
                        className="w-full rounded border px-2 py-1 text-left text-xs hover:bg-muted"
                        onClick={() => setSessionId(session.session_id)}
                      >
                        {session.active ? "active" : "inactive"} - {session.session_id}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
