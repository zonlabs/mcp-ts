"use client";

import { useState, useEffect, useMemo } from "react";
import { CalendarClock, Loader2, CheckCircle2 } from "lucide-react";
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
import type { Workflow, Schedule } from "@/types/workflow";
import { defaultParamsToJson } from "@/lib/utils";

interface RunOnceDialogProps {
  workflow: Workflow;
  open: boolean;
  onClose: () => void;
  onSuccess?: (schedule: Schedule) => void;
}

function toLocalDateTimeString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${d}T${h}:${min}`;
}

function localDateTimeToCronUTC(localDateTime: string): {
  cron: string;
  utcDate: Date;
} {
  const d = new Date(localDateTime);
  const minute = d.getUTCMinutes();
  const hour = d.getUTCHours();
  const dayOfMonth = d.getUTCDate();
  const month = d.getUTCMonth() + 1;
  return {
    cron: `${minute} ${hour} ${dayOfMonth} ${month} *`,
    utcDate: d,
  };
}

export function RunOnceDialog({
  workflow,
  open,
  onClose,
  onSuccess,
}: RunOnceDialogProps) {
  const defaultsKey = useMemo(
    () => JSON.stringify(workflow.default_params ?? {}),
    [workflow.default_params]
  );

  const defaultTime = new Date(Date.now() + 10 * 60_000);
  defaultTime.setSeconds(0, 0);

  const [dateTime, setDateTime] = useState(toLocalDateTimeString(defaultTime));
  const [paramsJson, setParamsJson] = useState("{}");
  const [paramsError, setParamsError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [scheduledFor, setScheduledFor] = useState("");

  useEffect(() => {
    if (!open) return;
    const t = new Date(Date.now() + 10 * 60_000);
    t.setSeconds(0, 0);
    setDateTime(toLocalDateTimeString(t));
    setParamsJson(defaultParamsToJson(workflow.default_params));
    setParamsError(null);
    setError(null);
    setLoading(false);
    setSuccess(false);
    setScheduledFor("");
  }, [open, workflow.id, defaultsKey]);

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

  async function handleSchedule() {
    if (!dateTime) {
      setError("Please select a date and time");
      return;
    }

    const selected = new Date(dateTime);
    if (selected <= new Date()) {
      setError("Selected time must be in the future");
      return;
    }

    const userParams = validateParams();
    if (userParams === null) return;

    const { cron } = localDateTimeToCronUTC(dateTime);

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/workflows/${workflow.id}/schedules`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: `One-time run: ${selected.toLocaleString()}`,
          cron_expression: cron,
          is_enabled: true,
          params: { ...userParams, _one_time: true },
        }),
      });

      const contentType = res.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) {
        setError(`Server error (${res.status})`);
        return;
      }

      const body = (await res.json()) as {
        schedule?: Schedule;
        error?: string;
      };

      if (!res.ok) {
        setError(body.error ?? "Failed to create schedule");
        return;
      }

      setSuccess(true);
      setScheduledFor(
        selected.toLocaleString(undefined, {
          dateStyle: "medium",
          timeStyle: "short",
        })
      );
      onSuccess?.(body.schedule!);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }

  const minDateTime = toLocalDateTimeString(new Date());

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-primary" />
            Run Once At
          </DialogTitle>
          <DialogDescription>
            Schedule{" "}
            <span className="font-medium text-foreground">{workflow.name}</span>{" "}
            to run once at a specific time. The schedule auto-disables after
            execution.
          </DialogDescription>
        </DialogHeader>

        {success ? (
          <div className="py-4">
            <div className="flex items-start gap-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-4">
              <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-green-800 dark:text-green-300">
                  One-time run scheduled
                </p>
                <p className="text-sm text-green-700 dark:text-green-400 mt-1">
                  Will execute at{" "}
                  <span className="font-medium">{scheduledFor}</span> and
                  auto-disable afterwards.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="run-once-dt">Date & Time</Label>
              <Input
                id="run-once-dt"
                type="datetime-local"
                value={dateTime}
                min={minDateTime}
                onChange={(e) => setDateTime(e.target.value)}
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Select the date and time in your local timezone. The scheduler
                converts to UTC internally.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="run-once-params">
                Params{" "}
                <span className="text-muted-foreground font-normal text-xs">
                  (JSON object)
                </span>
              </Label>
              <Textarea
                id="run-once-params"
                value={paramsJson}
                onChange={(e) => {
                  setParamsJson(e.target.value);
                  setParamsError(null);
                }}
                rows={3}
                className="font-mono text-xs"
                placeholder="{}"
              />
              {paramsError && (
                <p className="text-xs text-destructive">{paramsError}</p>
              )}
            </div>

            {error && (
              <p className="text-sm text-destructive rounded-lg bg-destructive/10 px-3 py-2">
                {error}
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            {success ? "Close" : "Cancel"}
          </Button>
          {!success && (
            <Button onClick={handleSchedule} disabled={loading} className="gap-2">
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Scheduling…
                </>
              ) : (
                <>
                  <CalendarClock className="w-4 h-4" />
                  Schedule Run
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
