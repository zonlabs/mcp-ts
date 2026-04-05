"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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
  Trash2,
  Plus,
  Pause,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { RunOnceDialog } from "./RunOnceDialog";
import { HistoryList } from "./HistoryList";
import { StepEditor } from "./StepEditor";
import type { WorkflowDetail as WFDetail, Schedule, Workflow } from "@/types/workflows";
import { cn, defaultParamsToJson } from "@/lib/utils";
import { toast } from "react-hot-toast";
import { useWorkflowsStore } from "@/stores/workflows";
import {
  deleteSchedule as apiDeleteSchedule,
  deleteWorkflow as apiDeleteWorkflow,
  updateSchedule as apiUpdateSchedule,
  updateWorkflow as apiUpdateWorkflow,
} from "@/lib/workflows.api";

interface WorkflowDetailProps {
  workflowId: string;
  /** From `?tab=` (e.g. `default-inputs`) */
  initialTab?: string;
}

const MAIN_TABS = new Set(["overview", "default-inputs", "steps", "schedules", "history"]);

function normalizeMainTab(t: string | undefined): string {
  return t && MAIN_TABS.has(t) ? t : "overview";
}

function humanizeParamKey(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function getInputProps(
  schema: unknown
): Record<string, { type?: string; description?: string }> {
  if (!schema || typeof schema !== "object") return {};
  const o = schema as { properties?: Record<string, { type?: string; description?: string }> };
  return o.properties && typeof o.properties === "object" ? o.properties : {};
}

function getRequiredKeys(schema: unknown): string[] {
  if (!schema || typeof schema !== "object") return [];
  const r = (schema as { required?: unknown }).required;
  return Array.isArray(r) ? r.filter((x): x is string => typeof x === "string") : [];
}

function buildDefaultsDraft(wf: WFDetail): Record<string, string> {
  const props = getInputProps(wf.input_schema);
  const keys = new Set([...Object.keys(props), ...Object.keys(wf.default_params ?? {})]);
  const out: Record<string, string> = {};
  for (const k of keys) {
    const v = wf.default_params?.[k];
    out[k] =
      v === undefined || v === null
        ? ""
        : typeof v === "object"
          ? JSON.stringify(v)
          : String(v);
  }
  return out;
}

function draftToSavedParams(
  draft: Record<string, string>,
  inputSchema: unknown
): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  const props = getInputProps(inputSchema);
  const required = new Set(getRequiredKeys(inputSchema));
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(draft)) {
    const raw = draft[key]?.trim() ?? "";
    if (raw === "" && !required.has(key)) continue;
    if (raw === "" && required.has(key)) {
      return { ok: false, error: `${humanizeParamKey(key)} is required` };
    }
    const t = props[key]?.type;
    if (t === "number") {
      const n = Number(raw);
      if (!Number.isFinite(n)) return { ok: false, error: `"${key}" must be a valid number` };
      out[key] = n;
    } else if (t === "boolean") {
      out[key] = raw === "true" || raw === "1";
    } else if (
      (raw.startsWith("{") && raw.endsWith("}")) ||
      (raw.startsWith("[") && raw.endsWith("]"))
    ) {
      try {
        out[key] = JSON.parse(raw) as unknown;
      } catch {
        out[key] = raw;
      }
    } else {
      out[key] = raw;
    }
  }
  for (const req of required) {
    if (out[req] === undefined && (draft[req]?.trim() ?? "") === "") {
      return { ok: false, error: `${humanizeParamKey(req)} is required` };
    }
  }
  return { ok: true, value: out };
}

function parseJsonDefaults(
  text: string
): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  try {
    const p = JSON.parse(text);
    if (typeof p !== "object" || p === null || Array.isArray(p)) {
      return { ok: false, error: "Must be a JSON object {}" };
    }
    return { ok: true, value: p as Record<string, unknown> };
  } catch {
    return { ok: false, error: "Invalid JSON" };
  }
}

function describeCron(cron: string | undefined): string {
  if (!cron) return "No schedule";
  const map: Record<string, string> = {
    "0 9 * * *": "Runs at 09:00 AM, every day",
    "0 8 * * *": "Runs at 08:00 AM, every day",
    "0 9 * * 1": "Runs at 09:00 AM, every Monday",
    "0 * * * *": "Runs every hour",
    "*/5 * * * *": "Runs every 5 minutes",
  };
  return map[cron] ?? `Cron: ${cron}`;
}

export function WorkflowDetail({ workflowId, initialTab }: WorkflowDetailProps) {
  const router = useRouter();
  const workflow = useWorkflowsStore((s) => s.workflowDetails[workflowId] ?? null);
  const loading = useWorkflowsStore((s) => s.workflowDetailsLoading[workflowId] ?? false);
  const error = useWorkflowsStore((s) => s.workflowDetailsError[workflowId] ?? null);
  const history = useWorkflowsStore((s) => s.workflowHistory[workflowId]);
  const historyLoading = useWorkflowsStore((s) => s.workflowHistoryLoading[workflowId] ?? false);
  const fetchWorkflowDetail = useWorkflowsStore((s) => s.fetchWorkflowDetail);
  const fetchWorkflowHistory = useWorkflowsStore((s) => s.fetchWorkflowHistory);
  const updateWorkflowDetail = useWorkflowsStore((s) => s.updateWorkflowDetail);
  const updateWorkflowInList = useWorkflowsStore((s) => s.updateWorkflowInList);
  const removeWorkflow = useWorkflowsStore((s) => s.removeWorkflow);
  const upsertScheduleInDetail = useWorkflowsStore((s) => s.upsertScheduleInDetail);
  const removeScheduleFromDetail = useWorkflowsStore((s) => s.removeScheduleFromDetail);

  // Edit state
  const [editingName, setEditingName] = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [descInput, setDescInput] = useState("");
  const [saving, setSaving] = useState(false);

  // Dialog state
  const [runOpen, setRunOpen] = useState(false);
  const [runOnceOpen, setRunOnceOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [editSchedule, setEditSchedule] = useState<Schedule | undefined>(undefined);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteSchedId, setDeleteSchedId] = useState<string | null>(null);

  const [mainTab, setMainTab] = useState(() => normalizeMainTab(initialTab));
  const [defaultsUseFields, setDefaultsUseFields] = useState(true);
  const [defaultsDraft, setDefaultsDraft] = useState<Record<string, string>>({});
  const [defaultsJsonText, setDefaultsJsonText] = useState("{}");
  const [defaultsSaving, setDefaultsSaving] = useState(false);
  const [defaultsError, setDefaultsError] = useState<string | null>(null);

  // Data fetching
  const fetchWorkflow = useCallback(async () => {
    await fetchWorkflowDetail(workflowId);
  }, [fetchWorkflowDetail, workflowId]);

  const lastFetchedRef = useRef<string | null>(null);
  useEffect(() => {
    if (workflow || loading) return;
    if (lastFetchedRef.current === workflowId) return;
    lastFetchedRef.current = workflowId;
    fetchWorkflow();
  }, [fetchWorkflow, loading, workflow, workflowId]);

  useEffect(() => {
    setMainTab(normalizeMainTab(initialTab));
  }, [workflowId, initialTab]);

  useEffect(() => {
    if (!workflow) return;
    const props = getInputProps(workflow.input_schema);
    if (Object.keys(props).length > 0) {
      setDefaultsUseFields(true);
      setDefaultsDraft(buildDefaultsDraft(workflow));
    } else {
      setDefaultsUseFields(false);
      setDefaultsJsonText(defaultParamsToJson(workflow.default_params));
    }
    setDefaultsError(null);
  }, [workflow]);

  const historyList = history ?? [];

  function onMainTabChange(tab: string) {
    setMainTab(tab);
    const path = `/workflows/${workflowId}`;
    const q = tab === "overview" ? "" : `?tab=${encodeURIComponent(tab)}`;
    router.replace(`${path}${q}`, { scroll: false });
    if (tab === "history" && historyList.length === 0) {
      fetchHistory();
    }
  }

  async function fetchHistory() {
    await fetchWorkflowHistory(workflowId, 20);
  }

  // Inline editing
  async function saveName() {
    if (!nameInput.trim() || !workflow) return;
    setSaving(true);
    try {
      const res = await apiUpdateWorkflow(workflowId, { name: nameInput.trim() });
      if (res.ok) {
        updateWorkflowDetail(workflowId, { name: nameInput.trim() });
        updateWorkflowInList(workflowId, { name: nameInput.trim() });
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
      const res = await apiUpdateWorkflow(workflowId, { description: descInput.trim() || null });
      if (res.ok) {
        updateWorkflowDetail(workflowId, { description: descInput.trim() || null });
        updateWorkflowInList(workflowId, { description: descInput.trim() || null });
        setEditingDesc(false);
      }
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive() {
    if (!workflow) return;
    const newVal = !workflow.is_active;
    const res = await apiUpdateWorkflow(workflowId, { is_active: newVal });
    if (res.ok) {
      updateWorkflowDetail(workflowId, { is_active: newVal });
      updateWorkflowInList(workflowId, { is_active: newVal });
    }
  }

  async function deleteWorkflow() {
    const res = await apiDeleteWorkflow(workflowId);
    if (res.ok) {
      removeWorkflow(workflowId);
      router.push("/workflows");
    }
  }

  async function deleteSchedule(scheduleId: string) {
    if (!workflow) return;
    const res = await apiDeleteSchedule(workflowId, scheduleId);
    if (res.ok) {
      removeScheduleFromDetail(workflowId, scheduleId);
      updateWorkflowInList(workflowId, {
        schedule_count: Math.max(0, workflow.scheduled_workflows.length - 1),
      });
    }
    setDeleteSchedId(null);
  }

  async function toggleSchedule(schedule: Schedule) {
    if (!workflow) return;
    const res = await apiUpdateSchedule(workflowId, schedule.id, {
      is_enabled: !schedule.is_enabled,
    });
    if (res.ok) {
      upsertScheduleInDetail(workflowId, { ...schedule, is_enabled: !schedule.is_enabled });
    }
  }

  function resetDefaultsForm() {
    if (!workflow) return;
    const props = getInputProps(workflow.input_schema);
    if (Object.keys(props).length > 0) {
      setDefaultsDraft(buildDefaultsDraft(workflow));
    } else {
      setDefaultsJsonText(defaultParamsToJson(workflow.default_params));
    }
    setDefaultsError(null);
  }

  async function saveDefaultParams() {
    if (!workflow) return;
    let value: Record<string, unknown>;
    if (defaultsUseFields) {
      const r = draftToSavedParams(defaultsDraft, workflow.input_schema);
      if (!r.ok) {
        setDefaultsError(r.error);
        toast.error(r.error);
        return;
      }
      value = r.value;
    } else {
      const r = parseJsonDefaults(defaultsJsonText);
      if (!r.ok) {
        setDefaultsError(r.error);
        toast.error(r.error);
        return;
      }
      value = r.value;
    }
    setDefaultsSaving(true);
    setDefaultsError(null);
    try {
      const res = await apiUpdateWorkflow(workflowId, { default_params: value });
      if (!res.ok) {
        const msg = res.error ?? "Save failed";
        setDefaultsError(msg);
        toast.error(msg);
        return;
      }
      updateWorkflowDetail(workflowId, { default_params: value });
      updateWorkflowInList(workflowId, { default_params: value });
      toast.success("Default inputs saved");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Network error";
      setDefaultsError(msg);
      toast.error(msg);
    } finally {
      setDefaultsSaving(false);
    }
  }

  // ── Loading / error ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] gap-2 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm">Loading workflow...</span>
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

  const primarySchedule = workflow.scheduled_workflows[0];
  const isScheduleActive = workflow.scheduled_workflows.some((s) => s.is_enabled);

  // Cast for RunDialog
  const workflowForDialog: Workflow = {
    id: workflow.id,
    name: workflow.name,
    description: workflow.description,
    is_active: workflow.is_active,
    created_at: workflow.created_at,
    default_params: workflow.default_params,
    toolkits,
    step_count: workflow.workflow_steps.length,
    schedule_count: workflow.scheduled_workflows.length,
    scheduled_workflows: workflow.scheduled_workflows,
  };

  return (
    <>
      <div className="px-3 sm:px-4 lg:px-6 py-6 md:py-10">
        {/* Back */}
        <div className="mb-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push("/workflows")}
            className="rounded-full border border-border"
            aria-label="Back"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </div>

        {/* Header */}
        <div className="mb-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              {editingName ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    className="text-2xl font-semibold h-10"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveName();
                      if (e.key === "Escape") setEditingName(false);
                    }}
                    autoFocus
                  />
                  <Button size="icon" variant="ghost" className="h-9 w-9" onClick={saveName} disabled={saving}>
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4 text-green-600" />}
                  </Button>
                  <Button size="icon" variant="ghost" className="h-9 w-9" onClick={() => setEditingName(false)}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2 group">
                  <h1 className="text-2xl font-semibold text-foreground leading-tight font-serif">
                    {workflow.name}
                  </h1>
                  <button
                    onClick={() => { setNameInput(workflow.name); setEditingName(true); }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-accent"
                    title="Edit name"
                  >
                    <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                </div>
              )}

              <div className="mt-5 grid gap-3 text-sm text-muted-foreground">
                {/*
                <div className="flex items-center gap-4">
                  <span className="w-20 text-xs uppercase tracking-wide text-muted-foreground/70">Apps</span>
                  <div className="flex items-center gap-2">
                    {toolkits.length > 0 ? (
                      toolkits.map((tk) => <ToolkitBadge key={tk} toolkit={tk} size="sm" showLabel />)
                    ) : (
                      <span className="text-xs">None</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <span className="w-20 text-xs uppercase tracking-wide text-muted-foreground/70">Creator</span>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs text-foreground">
                      {workflow.name.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="text-sm text-foreground">You</span>
                  </div>
                </div>
                */}

                <div className="flex items-center gap-4">
                  <span className="w-20 text-xs uppercase tracking-wide text-muted-foreground/70">Schedule</span>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={isScheduleActive ? "default" : "secondary"}
                      className="gap-1"
                    >
                      {isScheduleActive ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                      {isScheduleActive ? "Active" : "Inactive"}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      {describeCron(primarySchedule?.cron_expression)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

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
                onClick={() => toggleActive()}
              >
                {workflow.is_active ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                {workflow.is_active ? "Pause" : "Resume"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => {
                  setEditSchedule(primarySchedule);
                  setScheduleOpen(true);
                }}
              >
                <Clock className="w-3.5 h-3.5" />
                Edit Schedule
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-muted-foreground hover:text-destructive"
                onClick={() => setDeleteOpen(true)}
                title="Delete workflow"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={mainTab} onValueChange={onMainTabChange}>
          <TabsList className="bg-transparent p-0 border-b border-border rounded-none w-full justify-start">
            <TabsTrigger value="overview" className="rounded-none px-0 mr-6 data-[state=active]:border-b-2 data-[state=active]:border-foreground">
              Overview
            </TabsTrigger>
            <TabsTrigger value="default-inputs" className="rounded-none px-0 mr-6 data-[state=active]:border-b-2 data-[state=active]:border-foreground">
              Default Inputs
            </TabsTrigger>
            <TabsTrigger value="steps" className="rounded-none px-0 mr-6 data-[state=active]:border-b-2 data-[state=active]:border-foreground">
              Steps
            </TabsTrigger>
            <TabsTrigger value="schedules" className="rounded-none px-0 mr-6 data-[state=active]:border-b-2 data-[state=active]:border-foreground">
              Schedules
            </TabsTrigger>
            <TabsTrigger value="history" className="rounded-none px-0 data-[state=active]:border-b-2 data-[state=active]:border-foreground">
              History
            </TabsTrigger>
          </TabsList>

          {/* Overview tab */}
          <TabsContent value="overview" className="mt-5 space-y-5">
            {/* Description */}
            <section>
              <h2 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                What It Does
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
                  What You Provide
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
                            {val.description ?? val.type ?? "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </TabsContent>

          {/* Default inputs - saved defaults for {{params.*}} */}
          <TabsContent value="default-inputs" className="mt-5">
            <p className="text-sm text-muted-foreground mb-6 max-w-2xl">
              These values are stored on the workflow and pre-fill Run, Schedule, and Run once. They
              map to <code className="text-xs bg-muted px-1 rounded">{"{{params.*}}"}</code> in step
              arguments.
            </p>

            {defaultsUseFields ? (
              <div className="space-y-8 max-w-3xl">
                {Object.entries(getInputProps(workflow.input_schema)).map(([key, prop]) => {
                  const required = getRequiredKeys(workflow.input_schema).includes(key);
                  const isBool = prop.type === "boolean";
                  return (
                    <div
                      key={key}
                      className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-10"
                    >
                      <div className="sm:w-56 shrink-0 space-y-1">
                        <Label htmlFor={`default-${key}`} className="text-foreground">
                          {humanizeParamKey(key)}
                          {required ? (
                            <span className="text-destructive" aria-hidden>
                              {" "}
                              *
                            </span>
                          ) : null}
                        </Label>
                        {prop.description ? (
                          <p className="text-xs text-muted-foreground leading-relaxed">
                            {prop.description}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex-1 min-w-0">
                        {isBool ? (
                          <div className="flex items-center gap-2 pt-0.5">
                            <Switch
                              id={`default-${key}`}
                              checked={defaultsDraft[key] === "true" || defaultsDraft[key] === "1"}
                              onCheckedChange={(on) => {
                                setDefaultsDraft((d) => ({ ...d, [key]: on ? "true" : "false" }));
                              }}
                            />
                            <span className="text-sm text-muted-foreground">
                              {defaultsDraft[key] === "true" || defaultsDraft[key] === "1"
                                ? "True"
                                : "False"}
                            </span>
                          </div>
                        ) : (
                          <Input
                            id={`default-${key}`}
                            value={defaultsDraft[key] ?? ""}
                            onChange={(e) =>
                              setDefaultsDraft((d) => ({ ...d, [key]: e.target.value }))
                            }
                            type={prop.type === "number" ? "number" : "text"}
                            className="font-mono text-sm"
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-2 max-w-3xl">
                <Label htmlFor="defaults-json">Parameters (JSON object)</Label>
                <Textarea
                  id="defaults-json"
                  value={defaultsJsonText}
                  onChange={(e) => {
                    setDefaultsJsonText(e.target.value);
                    setDefaultsError(null);
                  }}
                  rows={12}
                  className="font-mono text-xs"
                  placeholder="{}"
                />
                <p className="text-xs text-muted-foreground">
                  This workflow has no input schema yet. Edit the raw JSON object, or add
                  input_properties when creating the workflow so fields appear above.
                </p>
              </div>
            )}

            {defaultsError ? (
              <p className="text-sm text-destructive mt-4 rounded-lg bg-destructive/10 px-3 py-2 max-w-3xl">
                {defaultsError}
              </p>
            ) : null}

            <div className="flex justify-end gap-2 mt-8 pt-4 border-t border-border max-w-3xl">
              <Button type="button" variant="outline" onClick={resetDefaultsForm} disabled={defaultsSaving}>
                Cancel
              </Button>
              <Button type="button" onClick={() => void saveDefaultParams()} disabled={defaultsSaving}>
                {defaultsSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Saving...
                  </>
                ) : (
                  "Save"
                )}
              </Button>
            </div>
          </TabsContent>

          {/* Steps tab */}
          <TabsContent value="steps" className="mt-5">
            <StepEditor
              workflowId={workflowId}
              steps={workflow.workflow_steps}
              onStepsChanged={(newSteps) => {
                updateWorkflowDetail(workflowId, { workflow_steps: newSteps });
                const nextToolkits = [...new Set(newSteps.map((s) => s.toolkit))];
                updateWorkflowInList(workflowId, {
                  step_count: newSteps.length,
                  toolkits: nextToolkits,
                });
              }}
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
            <HistoryList logs={historyList} loading={historyLoading} />
          </TabsContent>
        </Tabs>
      </div>

      {/* Dialogs */}
      <RunDialog
        workflow={workflowForDialog}
        open={runOpen}
        onClose={() => setRunOpen(false)}
        onSuccess={() => { fetchHistory(); }}
      />

      <RunOnceDialog
        workflow={workflowForDialog}
        open={runOnceOpen}
        onClose={() => setRunOnceOpen(false)}
        onSuccess={(sched) => {
          upsertScheduleInDetail(workflowId, sched);
          updateWorkflowInList(workflowId, {
            schedule_count: workflow.scheduled_workflows.length + 1,
          });
        }}
      />

      <ScheduleDialog
        workflow={workflowForDialog}
        schedule={editSchedule}
        open={scheduleOpen}
        onClose={() => { setScheduleOpen(false); setEditSchedule(undefined); }}
        onSuccess={(sched) => {
          if (editSchedule) {
            upsertScheduleInDetail(workflowId, sched);
          } else {
            upsertScheduleInDetail(workflowId, sched);
            updateWorkflowInList(workflowId, {
              schedule_count: workflow.scheduled_workflows.length + 1,
            });
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
