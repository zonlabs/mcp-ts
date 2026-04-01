"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Play,
  Clock,
  CheckCircle2,
  XCircle,
  Pencil,
  Check,
  X,
  Loader2,
  ToggleLeft,
  ToggleRight,
  Trash2,
  Plus,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ToolkitBadge } from "./ToolkitBadge";
import { RunDialog } from "./RunDialog";
import { ScheduleDialog } from "./ScheduleDialog";
import { HistoryList } from "./HistoryList";
import { StepEditor } from "./StepEditor";
import type { WorkflowDetail as WFDetail, ExecutionLog, Schedule, Workflow, WorkflowStep } from "@/types/workflow";
import { cn } from "@/lib/utils";

interface WorkflowDetailProps {
  workflowId: string;
}

function formatDate(iso: string): string {
  const d = new Date(iso.endsWith("Z") ? iso : iso + "Z");
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function formatDuration(ms: number | null): string {
  if (!ms) return "";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
}

export function WorkflowDetail({ workflowId }: WorkflowDetailProps) {
  const router = useRouter();
  const [workflow, setWorkflow] = useState<WFDetail | null>(null);
  const [history, setHistory] = useState<ExecutionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Edit state
  const [editingName, setEditingName] = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [descInput, setDescInput] = useState("");
  const [saving, setSaving] = useState(false);

  // Dialog state
  const [runOpen, setRunOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [editSchedule, setEditSchedule] = useState<Schedule | undefined>(undefined);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteSchedId, setDeleteSchedId] = useState<string | null>(null);

  // ── Data fetching ─────────────────────────────────────────────────────────
  const fetchWorkflow = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/workflows/${workflowId}`);
      if (!res.ok) {
        setError("Workflow not found");
        return;
      }
      const data = (await res.json()) as { workflow: WFDetail };
      setWorkflow(data.workflow);
    } finally {
      setLoading(false);
    }
  }, [workflowId]);

  useEffect(() => {
    fetchWorkflow();
  }, [fetchWorkflow]);

  function handleTabChange(tab: string) {
    if (tab === "history" && history.length === 0) {
      fetchHistory();
    }
  }

  async function fetchHistory() {
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/workflows/history?workflowId=${workflowId}&limit=20`);
      if (res.ok) {
        const data = (await res.json()) as { logs: ExecutionLog[] };
        setHistory(data.logs ?? []);
      }
    } finally {
      setHistoryLoading(false);
    }
  }

  // ── Inline editing ────────────────────────────────────────────────────────
  async function saveName() {
    if (!nameInput.trim() || !workflow) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/workflows/${workflowId}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: nameInput.trim() }),
      });
      if (res.ok) {
        setWorkflow({ ...workflow, name: nameInput.trim() });
        setEditingName(false);
      }
    } finally {
      setSaving(false);
    }
  }

  async function saveDescription() {
    if (!workflow) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/workflows/${workflowId}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ description: descInput.trim() || null }),
      });
      if (res.ok) {
        setWorkflow({ ...workflow, description: descInput.trim() || null });
        setEditingDesc(false);
      }
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive() {
    if (!workflow) return;
    const newVal = !workflow.is_active;
    const res = await fetch(`/api/workflows/${workflowId}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ is_active: newVal }),
    });
    if (res.ok) setWorkflow({ ...workflow, is_active: newVal });
  }

  async function deleteWorkflow() {
    const res = await fetch(`/api/workflows/${workflowId}`, { method: "DELETE" });
    if (res.ok) router.push("/workflows");
  }

  async function deleteSchedule(scheduleId: string) {
    if (!workflow) return;
    const res = await fetch(`/api/workflows/${workflowId}/schedules/${scheduleId}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setWorkflow({
        ...workflow,
        scheduled_workflows: workflow.scheduled_workflows.filter((s) => s.id !== scheduleId),
      });
    }
    setDeleteSchedId(null);
  }

  async function toggleSchedule(schedule: Schedule) {
    if (!workflow) return;
    const res = await fetch(`/api/workflows/${workflowId}/schedules/${schedule.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ is_enabled: !schedule.is_enabled }),
    });
    if (res.ok) {
      setWorkflow({
        ...workflow,
        scheduled_workflows: workflow.scheduled_workflows.map((s) =>
          s.id === schedule.id ? { ...s, is_enabled: !s.is_enabled } : s
        ),
      });
    }
  }

  // ── Loading / error ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] gap-2 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm">Loading workflow…</span>
      </div>
    );
  }

  if (error || !workflow) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <p className="text-muted-foreground text-sm">{error ?? "Workflow not found"}</p>
        <Button variant="outline" size="sm" onClick={() => router.push("/workflows")}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Workflows
        </Button>
      </div>
    );
  }

  // Toolkit list from steps
  const toolkits = [...new Set(workflow.workflow_steps.map((s) => s.toolkit))];

  // Cast for RunDialog
  const workflowForDialog: Workflow = {
    id: workflow.id,
    name: workflow.name,
    description: workflow.description,
    is_active: workflow.is_active,
    created_at: workflow.created_at,
    toolkits,
    step_count: workflow.workflow_steps.length,
    schedule_count: workflow.scheduled_workflows.length,
  };

  return (
    <>
      <div className="px-3 sm:px-4 lg:px-6 py-6 md:py-10">
        {/* Back */}
        <button
          onClick={() => router.push("/workflows")}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Workflows
        </button>

        {/* Header card — matches image 1 layout */}
        <div className="rounded-xl border border-border bg-card px-6 py-5 mb-6">
          <div className="flex items-start justify-between gap-4">
            {/* Title & status */}
            <div className="flex-1 min-w-0">
              {editingName ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    className="text-xl font-bold h-9"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveName();
                      if (e.key === "Escape") setEditingName(false);
                    }}
                    autoFocus
                  />
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={saveName} disabled={saving}>
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4 text-green-600" />}
                  </Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditingName(false)}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2 group">
                  <h1 className="text-xl font-bold text-foreground leading-tight">{workflow.name}</h1>
                  <button
                    onClick={() => { setNameInput(workflow.name); setEditingName(true); }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-accent"
                    title="Edit name"
                  >
                    <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 shrink-0">
              <Button
                onClick={() => setRunOpen(true)}
                disabled={!workflow.is_active}
                className="gap-2"
                size="sm"
              >
                <Play className="w-3.5 h-3.5" />
                Run
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => { setEditSchedule(undefined); setScheduleOpen(true); }}
              >
                <Clock className="w-3.5 h-3.5" />
                Add Schedule
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                onClick={() => setDeleteOpen(true)}
                title="Delete workflow"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Meta row */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mt-4 text-sm text-muted-foreground">
            {toolkits.length > 0 && (
              <span className="flex items-center gap-1.5">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground/70">Apps</span>
                {toolkits.map((tk) => (
                  <ToolkitBadge key={tk} toolkit={tk} size="sm" showLabel />
                ))}
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <User className="w-3.5 h-3.5" />
              <span className="text-xs">Created {formatDate(workflow.created_at)}</span>
            </span>
            <span className="flex items-center gap-2">
              <Switch
                checked={workflow.is_active}
                onCheckedChange={toggleActive}
                className="scale-75"
              />
              <span className="text-xs">{workflow.is_active ? "Active" : "Inactive"}</span>
            </span>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="overview" onValueChange={handleTabChange}>
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="steps">
              Steps
              {workflow.workflow_steps.length > 0 && (
                <span className="ml-1.5 text-xs bg-muted rounded-full px-1.5 py-0.5">
                  {workflow.workflow_steps.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="schedules">
              Schedules
              {workflow.scheduled_workflows.length > 0 && (
                <span className="ml-1.5 text-xs bg-muted rounded-full px-1.5 py-0.5">
                  {workflow.scheduled_workflows.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>

          {/* Overview tab */}
          <TabsContent value="overview" className="mt-5 space-y-5">
            {/* Description */}
            <section>
              <h2 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                💡 What It Does
              </h2>
              {editingDesc ? (
                <div className="space-y-2">
                  <Textarea
                    value={descInput}
                    onChange={(e) => setDescInput(e.target.value)}
                    rows={4}
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={saveDescription} disabled={saving}>
                      {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                      Save
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setEditingDesc(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div
                  className="group relative rounded-lg bg-muted/50 px-4 py-3 text-sm text-muted-foreground leading-relaxed cursor-pointer hover:bg-muted/70 transition-colors"
                  onClick={() => { setDescInput(workflow.description ?? ""); setEditingDesc(true); }}
                >
                  {workflow.description ?? (
                    <span className="italic text-muted-foreground/60">No description yet. Click to add one.</span>
                  )}
                  <Pencil className="absolute top-3 right-3 w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              )}
            </section>

            {/* Input schema */}
            {workflow.input_schema &&
              Object.keys((workflow.input_schema as { properties?: object }).properties ?? {}).length > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                  📋 What You Provide
                </h2>
                <div className="rounded-lg border border-border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/50 border-b border-border">
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide w-1/3">
                          Input
                        </th>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                          What to enter
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(
                        (workflow.input_schema as { properties: Record<string, { description?: string; type?: string }> }).properties ?? {}
                      ).map(([key, val], i) => (
                        <tr key={key} className={cn("border-b border-border last:border-0", i % 2 === 1 && "bg-muted/20")}>
                          <td className="px-4 py-3 font-mono text-xs text-foreground">{key}</td>
                          <td className="px-4 py-3 text-muted-foreground text-xs">
                            {val.description ?? val.type ?? "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </TabsContent>

          {/* Steps tab */}
          <TabsContent value="steps" className="mt-5">
            <StepEditor
              workflowId={workflowId}
              steps={workflow.workflow_steps}
              onStepsChanged={(newSteps) =>
                setWorkflow({ ...workflow, workflow_steps: newSteps })
              }
            />
          </TabsContent>

          {/* Schedules tab */}
          <TabsContent value="schedules" className="mt-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold">Schedules</h3>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => { setEditSchedule(undefined); setScheduleOpen(true); }}
              >
                <Plus className="w-3.5 h-3.5" />
                Add Schedule
              </Button>
            </div>

            {workflow.scheduled_workflows.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center rounded-xl border border-dashed border-border">
                <Clock className="w-10 h-10 text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">No schedules configured</p>
                <p className="text-xs text-muted-foreground/60 mt-1">
                  Add a schedule to run this workflow automatically
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {workflow.scheduled_workflows.map((sched) => (
                  <div
                    key={sched.id}
                    className="flex items-center gap-4 rounded-lg border border-border bg-card px-4 py-3"
                  >
                    <Clock className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{sched.name}</p>
                      <p className="text-xs font-mono text-muted-foreground mt-0.5">{sched.cron_expression}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Switch
                        checked={sched.is_enabled}
                        onCheckedChange={() => toggleSchedule(sched)}
                        className="scale-75"
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => { setEditSchedule(sched); setScheduleOpen(true); }}
                        title="Edit schedule"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => setDeleteSchedId(sched.id)}
                        title="Delete schedule"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* History tab */}
          <TabsContent value="history" className="mt-5">
            <HistoryList logs={history} loading={historyLoading} />
          </TabsContent>
        </Tabs>
      </div>

      {/* ── Dialogs ── */}
      <RunDialog
        workflow={workflowForDialog}
        open={runOpen}
        onClose={() => setRunOpen(false)}
        onSuccess={() => { setHistory([]); fetchHistory(); }}
      />

      <ScheduleDialog
        workflow={workflowForDialog}
        schedule={editSchedule}
        open={scheduleOpen}
        onClose={() => { setScheduleOpen(false); setEditSchedule(undefined); }}
        onSuccess={(sched) => {
          if (editSchedule) {
            setWorkflow({
              ...workflow,
              scheduled_workflows: workflow.scheduled_workflows.map((s) =>
                s.id === sched.id ? sched : s
              ),
            });
          } else {
            setWorkflow({ ...workflow, scheduled_workflows: [...workflow.scheduled_workflows, sched] });
          }
        }}
      />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Workflow</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <span className="font-semibold">{workflow.name}</span>{" "}
              including all steps, schedules, and execution history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={deleteWorkflow}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteSchedId} onOpenChange={(v) => !v && setDeleteSchedId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Schedule</AlertDialogTitle>
            <AlertDialogDescription>
              This schedule will be permanently removed. The workflow will no longer run automatically.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteSchedId && deleteSchedule(deleteSchedId)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
