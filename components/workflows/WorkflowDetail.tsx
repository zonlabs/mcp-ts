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
  Braces,
  History,
  Save,
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
import { HistoryList } from "./HistoryList";
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

const MAIN_TABS = new Set(["overview", "script", "default-inputs", "schedules", "history"]);

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

  const [scriptDraft, setScriptDraft] = useState("");
  const [scriptSaving, setScriptSaving] = useState(false);

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
    setScriptDraft(workflow.script_code ?? "");
    setDefaultsError(null);
  }, [workflow]);

  const historyList = history ?? [];

  function onMainTabChange(tab: string) {
    setMainTab(tab);
    const path = `/workflows/${workflowId}`;
    const q = tab === "overview" ? "" : `?tab=${encodeURIComponent(tab)}`;
    router.replace(`${path}${q}`, { scroll: false });
    if (tab === "history" && historyList.length === 0) {
      fetchWorkflowHistory(workflowId, 20);
    }
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

  async function handleDeleteWorkflow() {
    const res = await apiDeleteWorkflow(workflowId);
    if (res.ok) {
      removeWorkflow(workflowId);
      router.push("/workflows");
    }
  }

  async function handleDeleteSchedule(scheduleId: string) {
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

  async function saveScript() {
    if (!workflow) return;
    setScriptSaving(true);
    try {
      const res = await apiUpdateWorkflow(workflowId, { script_code: scriptDraft });
      if (!res.ok) {
        toast.error(res.error ?? "Failed to save script");
        return;
      }
      updateWorkflowDetail(workflowId, { script_code: scriptDraft });
      updateWorkflowInList(workflowId, { script_code: scriptDraft });
      toast.success("Script saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Network error");
    } finally {
      setScriptSaving(false);
    }
  }

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

  const toolkits = workflow.toolkit_ids;
  const primarySchedule = workflow.scheduled_workflows[0];
  const isScheduleActive = workflow.scheduled_workflows.some((s) => s.is_enabled);

  const workflowForDialog: Workflow = {
    id: workflow.id,
    name: workflow.name,
    description: workflow.description,
    is_active: workflow.is_active,
    created_at: workflow.created_at,
    default_params: workflow.default_params,
    toolkit_ids: toolkits,
    schedule_count: workflow.scheduled_workflows.length,
    scheduled_workflows: workflow.scheduled_workflows,
  };

  return (
    <>
      <div className="px-3 sm:px-4 lg:px-6 py-6 md:py-10">
        <div className="mb-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push("/workflows")}
            className="rounded-full border border-border"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </div>

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
                  <Button size="icon" variant="ghost" onClick={saveName} disabled={saving}>
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4 text-green-600" />}
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => setEditingName(false)}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2 group">
                  <h1 className="text-2xl font-semibold text-foreground tracking-tight font-serif">
                    {workflow.name}
                  </h1>
                  <button
                    onClick={() => { setNameInput(workflow.name); setEditingName(true); }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-accent"
                  >
                    <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                </div>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Badge variant={isScheduleActive ? "default" : "secondary"} className="gap-1.5">
                    {isScheduleActive ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                    {isScheduleActive ? "Active" : "Inactive"}
                  </Badge>
                  <span className="text-sm">
                    {describeCron(primarySchedule?.cron_expression)}
                  </span>
                </div>
                {toolkits.length > 0 && (
                  <div className="flex gap-1.5">
                    {toolkits.map((tk) => <ToolkitBadge key={tk} toolkit={tk} size="sm" />)}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button onClick={() => setRunOpen(true)} disabled={!workflow.is_active} className="gap-2" size="sm">
                <Play className="w-3.5 h-3.5" />
                Run
              </Button>
              <Button variant="outline" size="sm" className="gap-2" onClick={toggleActive}>
                {workflow.is_active ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                {workflow.is_active ? "Pause" : "Resume"}
              </Button>
              <Button variant="ghost" size="icon" className="h-9 w-9 hover:text-destructive" onClick={() => setDeleteOpen(true)}>
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        <Tabs value={mainTab} onValueChange={onMainTabChange}>
          <TabsList className="bg-transparent p-0 border-b border-border rounded-none w-full justify-start mb-6">
            <TabsTrigger value="overview" className="rounded-none px-0 mr-8 border-x-0 border-t-0 data-[state=active]:border-b-2 data-[state=active]:border-foreground">Overview</TabsTrigger>
            <TabsTrigger value="script" className="rounded-none px-0 mr-8 border-x-0 border-t-0 data-[state=active]:border-b-2 data-[state=active]:border-foreground">Script</TabsTrigger>
            <TabsTrigger value="schedules" className="rounded-none px-0 mr-8 border-x-0 border-t-0 data-[state=active]:border-b-2 data-[state=active]:border-foreground">Schedules</TabsTrigger>
            <TabsTrigger value="default-inputs" className="rounded-none px-0 mr-8 border-x-0 border-t-0 data-[state=active]:border-b-2 data-[state=active]:border-foreground">Default Inputs</TabsTrigger>
            <TabsTrigger value="history" className="rounded-none px-0 border-x-0 border-t-0 data-[state=active]:border-b-2 data-[state=active]:border-foreground">History</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <section>
              <h3 className="text-sm font-semibold mb-2">Description</h3>
              {editingDesc ? (
                <div className="space-y-3">
                  <Textarea value={descInput} onChange={(e) => setDescInput(e.target.value)} rows={3} autoFocus />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={saveDescription} disabled={saving}>Save</Button>
                    <Button size="sm" variant="outline" onClick={() => setEditingDesc(false)}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <div className="group relative rounded-xl border border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground leading-relaxed cursor-pointer hover:bg-muted/30" onClick={() => { setDescInput(workflow.description ?? ""); setEditingDesc(true); }}>
                  {workflow.description || <span className="italic opacity-50">No description provided</span>}
                  <Pencil className="absolute top-3 right-3 w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              )}
            </section>
          </TabsContent>

          <TabsContent value="script" className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Workflow Logic (JavaScript)</h3>
              <Button size="sm" onClick={saveScript} disabled={scriptSaving} className="gap-2">
                {scriptSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Save Script
              </Button>
            </div>
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <Textarea
                value={scriptDraft}
                onChange={(e) => setScriptDraft(e.target.value)}
                rows={25}
                className="font-mono text-[13px] leading-relaxed resize-none border-0 focus-visible:ring-0 rounded-none bg-transparent p-4"
                placeholder="// Write your workflow logic here..."
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Define an <code>async function main(params, context)</code> to handle the execution logic.
            </p>
          </TabsContent>

          <TabsContent value="schedules">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold">Configured Schedules</h3>
              <Button size="sm" onClick={() => { setEditSchedule(undefined); setScheduleOpen(true); }} className="gap-2">
                <Plus className="w-3.5 h-3.5" />
                Add Schedule
              </Button>
            </div>
            <div className="space-y-3">
              {workflow.scheduled_workflows.length === 0 ? (
                <div className="py-12 text-center rounded-xl border border-dashed border-border bg-muted/20">
                  <Clock className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">No schedules active</p>
                </div>
              ) : (
                workflow.scheduled_workflows.map((s) => (
                  <div key={s.id} className="flex items-center gap-4 rounded-xl border border-border bg-card px-4 py-3">
                    <Clock className="w-4 h-4 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{s.name}</p>
                      <p className="text-xs text-muted-foreground font-mono mt-0.5">{s.cron_expression}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch checked={s.is_enabled} onCheckedChange={() => toggleSchedule(s)} className="scale-75" />
                      <Button size="icon" variant="ghost" onClick={() => { setEditSchedule(s); setScheduleOpen(true); }}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="text-muted-foreground hover:text-destructive" onClick={() => setDeleteSchedId(s.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="default-inputs">
            <div className="max-w-2xl space-y-6">
              <div className="rounded-xl border border-border overflow-hidden">
                <div className="bg-muted/30 px-4 py-3 border-b border-border">
                  <h3 className="text-sm font-semibold">Default Input Values</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Pre-filled when running or scheduling this workflow</p>
                </div>
                <div className="p-4 space-y-4">
                  {Object.keys(getInputProps(workflow.input_schema)).length > 0 ? (
                    Object.entries(getInputProps(workflow.input_schema)).map(([key, prop]) => (
                      <div key={key} className="space-y-1.5">
                        <Label className="text-xs font-semibold">{humanizeParamKey(key)}</Label>
                        <Input
                          value={defaultsDraft[key] ?? ""}
                          onChange={(e) => setDefaultsDraft(d => ({ ...d, [key]: e.target.value }))}
                          placeholder={prop.description || "Enter value..."}
                          className="font-mono text-sm"
                        />
                      </div>
                    ))
                  ) : (
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold">Raw Parameters (JSON)</Label>
                      <Textarea
                        value={defaultsJsonText}
                        onChange={(e) => setDefaultsJsonText(e.target.value)}
                        rows={8}
                        className="font-mono text-sm"
                        placeholder="{}"
                      />
                    </div>
                  )}
                </div>
                <div className="bg-muted/30 px-4 py-3 border-t border-border flex justify-end">
                  <Button size="sm" onClick={saveDefaultParams} disabled={defaultsSaving} className="gap-2">
                    {defaultsSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    Save Inputs
                  </Button>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="history">
            <HistoryList logs={historyList} loading={false} />
          </TabsContent>
        </Tabs>
      </div>

      <RunDialog workflow={workflowForDialog} open={runOpen} onClose={() => setRunOpen(false)} />
      
      <ScheduleDialog
        workflow={workflowForDialog}
        schedule={editSchedule}
        open={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        onSuccess={(s) => {
          upsertScheduleInDetail(workflowId, s);
          setScheduleOpen(false);
        }}
      />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently delete the workflow and all its schedules.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteWorkflow} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteSchedId} onOpenChange={(v) => !v && setDeleteSchedId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Schedule?</AlertDialogTitle>
            <AlertDialogDescription>The workflow will no longer run automatically at this interval.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteSchedId && handleDeleteSchedule(deleteSchedId)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
