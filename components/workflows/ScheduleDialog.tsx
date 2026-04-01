"use client";

import { useState, useEffect } from "react";
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
import type { Workflow, Schedule } from "@/types/workflow";

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
  const isEditing = !!schedule;
  const [name, setName] = useState("");
  const [cronExpr, setCronExpr] = useState("0 9 * * *");
  const [paramsJson, setParamsJson] = useState("{}");
  const [isEnabled, setIsEnabled] = useState(true);
  const [paramsError, setParamsError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (schedule) {
      setName(schedule.name);
      setCronExpr(schedule.cron_expression);
      setParamsJson(JSON.stringify(schedule.params ?? {}, null, 2));
      setIsEnabled(schedule.is_enabled);
    } else {
      setName(`${workflow.name} Schedule`);
      setCronExpr("0 9 * * *");
      setParamsJson("{}");
      setIsEnabled(true);
    }
    setError(null);
    setParamsError(null);
  }, [open, schedule, workflow.name]);

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
      const url = isEditing
        ? `/api/workflows/${workflow.id}/schedules/${schedule!.id}`
        : `/api/workflows/${workflow.id}/schedules`;

      const res = await fetch(url, {
        method: isEditing ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim(), cron_expression: cronExpr.trim(), params, is_enabled: isEnabled }),
      });

      const body = (await res.json()) as { schedule?: Schedule; error?: string };

      if (!res.ok) {
        setError(body.error ?? "Failed to save schedule");
        return;
      }

      onSuccess?.(body.schedule!);
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
              Default Params{" "}
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
                Saving…
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
