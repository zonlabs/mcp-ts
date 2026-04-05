"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { Clock, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import type { Workflow, Schedule } from "@/types/workflows";
import { defaultParamsToJson } from "@/lib/utils";
import {
  createSchedule as apiCreateSchedule,
  fetchSchedules as apiFetchSchedules,
  updateSchedule as apiUpdateSchedule,
} from "@/lib/workflows.api";

interface ScheduleDialogProps {
  workflow: Workflow;
  /** Pass an existing schedule to edit it; omit for creation mode */
  schedule?: Schedule;
  open: boolean;
  onClose: () => void;
  onSuccess?: (schedule: Schedule) => void;
}

const CRON_EXAMPLES = [
  { label: "Every day at 9 am", cron: "0 9 * * *" },
  { label: "Every Monday at 9 am", cron: "0 9 * * 1" },
  { label: "Every hour", cron: "0 * * * *" },
  { label: "Every 5 minutes", cron: "*/5 * * * *" },
  { label: "Every weekday at 6 pm", cron: "0 18 * * 1-5" },
];

export function ScheduleDialog({
  workflow,
  schedule,
  open,
  onClose,
  onSuccess,
}: ScheduleDialogProps) {
  const [fetchedSchedule, setFetchedSchedule] = useState<Schedule | undefined>(undefined);
  const inferredSchedule =
    schedule ??
    fetchedSchedule ??
    (workflow.scheduled_workflows?.length ? workflow.scheduled_workflows[0] : undefined);
  const defaultsKey = useMemo(
    () =>
      JSON.stringify({
        defaults: workflow.default_params ?? {},
        schedule: inferredSchedule?.id ?? null,
      }),
    [workflow.default_params, inferredSchedule?.id]
  );
  const isEditing = !!inferredSchedule;
  const [name, setName] = useState("");
  const [cronExpr, setCronExpr] = useState("0 9 * * *");
  const [paramsJson, setParamsJson] = useState("{}");
  const [isEnabled, setIsEnabled] = useState(true);
  const [paramsError, setParamsError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const lastFetchKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (inferredSchedule) {
      setName(inferredSchedule.name);
      setCronExpr(inferredSchedule.cron_expression);
      setParamsJson(JSON.stringify(inferredSchedule.params ?? {}, null, 2));
      setIsEnabled(inferredSchedule.is_enabled);
    } else {
      setName(`${workflow.name} Schedule`);
      setCronExpr("0 9 * * *");
      setParamsJson(defaultParamsToJson(workflow.default_params));
      setIsEnabled(true);
    }
    setError(null);
    setParamsError(null);
  }, [open, inferredSchedule, workflow.name, workflow.id, defaultsKey]);

  useEffect(() => {
    if (!open) return;
    if (schedule || inferredSchedule) return;
    if (workflow.scheduled_workflows?.length) return;
    if (workflow.schedule_count <= 0) return;

    const fetchKey = `${workflow.id}:${workflow.schedule_count}`;
    if (lastFetchKeyRef.current === fetchKey) return;
    lastFetchKeyRef.current = fetchKey;

    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetchSchedules(workflow.id);
        if (!res.ok) return;
        const first = res.data?.[0];
        if (!cancelled && first) {
          setFetchedSchedule(first);
        }
      } catch {
        // ignore; fallback to defaults
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    open,
    schedule,
    inferredSchedule,
    workflow.id,
    workflow.schedule_count,
    workflow.scheduled_workflows?.length,
  ]);

  function validateParams(): Record<string, unknown> | null {
    try {
      const p = JSON.parse(paramsJson);
      if (typeof p !== "object" || Array.isArray(p) || p === null) {
        setParamsError("Must be a JSON object {}");
        return null;
      }
      setParamsError(null);
      return p as Record<string, unknown>;
    } catch {
      setParamsError("Invalid JSON");
      return null;
    }
  }

  async function handleSave() {
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    if (!cronExpr.trim()) {
      setError("Cron expression is required");
      return;
    }
    const params = validateParams();
    if (params === null) return;

    setLoading(true);
    setError(null);
    try {
      const res = isEditing
        ? await apiUpdateSchedule(workflow.id, inferredSchedule!.id, {
            name: name.trim(),
            cron_expression: cronExpr.trim(),
            params,
            is_enabled: isEnabled,
          })
        : await apiCreateSchedule(workflow.id, {
            name: name.trim(),
            cron_expression: cronExpr.trim(),
            params,
            is_enabled: isEnabled,
          });

      if (!res.ok) {
        setError(res.error ?? "Failed to save schedule");
        return;
      }

      onSuccess?.(res.data);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-primary" />
            {isEditing ? "Edit Schedule" : "Add Schedule"}
          </DialogTitle>
          <DialogDescription>
            {isEditing ? "Update the schedule for " : "Schedule "}
            <span className="font-medium text-foreground">{workflow.name}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="sched-name">Name</Label>
            <Input
              id="sched-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Daily report schedule"
            />
          </div>

          {/* Cron */}
          <div className="space-y-1.5">
            <Label htmlFor="sched-cron">Cron Expression</Label>
            <Input
              id="sched-cron"
              value={cronExpr}
              onChange={(e) => setCronExpr(e.target.value)}
              placeholder="0 9 * * *"
              className="font-mono"
            />
            <div className="flex flex-wrap gap-1.5 mt-1">
              {CRON_EXAMPLES.map((ex) => (
                <button
                  key={ex.cron}
                  type="button"
                  onClick={() => setCronExpr(ex.cron)}
                  className="text-xs px-2 py-0.5 rounded-full border border-border hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
                >
                  {ex.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Format: minute hour day-of-month month day-of-week (UTC)
            </p>
          </div>

          {/* Params */}
          <div className="space-y-1.5">
            <Label htmlFor="sched-params">
              {isEditing ? "Schedule Params" : "Default Params"}{" "}
              <span className="font-normal text-xs text-muted-foreground">(JSON object)</span>
            </Label>
            <Textarea
              id="sched-params"
              value={paramsJson}
              onChange={(e) => {
                setParamsJson(e.target.value);
                setParamsError(null);
              }}
              rows={3}
              className="font-mono text-xs"
              placeholder="{}"
            />
            {paramsError && <p className="text-xs text-destructive">{paramsError}</p>}
          </div>

          {/* Toggle */}
          <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
            <div>
              <p className="text-sm font-medium">Enable Schedule</p>
              <p className="text-xs text-muted-foreground">
                Workflow will run automatically when enabled
              </p>
            </div>
            <Switch checked={isEnabled} onCheckedChange={setIsEnabled} />
          </div>

          {error && (
            <p className="text-sm text-destructive rounded-lg bg-destructive/10 px-3 py-2">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Saving...
              </>
            ) : isEditing ? (
              "Save Changes"
            ) : (
              "Add Schedule"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
