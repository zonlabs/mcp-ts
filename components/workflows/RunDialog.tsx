"use client";

import { useState, useEffect } from "react";
import { Play, Loader2, Terminal } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { McpConnectionRecord } from "@/lib/mcp-connections";
import type { Workflow, McpSession } from "@/types/workflow";

interface RunDialogProps {
  workflow: Workflow;
  open: boolean;
  onClose: () => void;
  onSuccess?: (executionLogId: string) => void;
}

const DEFAULT_PARAMS = "{}";

export function RunDialog({ workflow, open, onClose, onSuccess }: RunDialogProps) {
  const [sessions, setSessions] = useState<McpSession[]>([]);
  const [scheduleId, setScheduleId] = useState<string>("");
  const [selectedSession, setSelectedSession] = useState<string>("");
  const [paramsJson, setParamsJson] = useState(DEFAULT_PARAMS);
  const [paramsError, setParamsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successId, setSuccessId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setParamsJson(DEFAULT_PARAMS);
      setParamsError(null);
      setError(null);
      setSuccessId(null);
      return;
    }

    async function loadRunContext() {
      setFetching(true);
      try {
        const [connRes, schRes] = await Promise.all([
          fetch("/api/mcp/connections"),
          fetch(`/api/workflows/${workflow.id}/schedules`),
        ]);

        if (connRes.ok) {
          const data = (await connRes.json()) as { connections?: McpConnectionRecord[] };
          const list = data.connections ?? [];
          setSessions(
            list.map((c) => ({
              session_id: c.sessionId,
              server_id: c.serverId,
              active: c.active,
            }))
          );
          if (list[0]) setSelectedSession(list[0].sessionId);
        }

        if (schRes.ok) {
          const sch = (await schRes.json()) as { schedules?: Array<{ id: string }> };
          if (sch.schedules?.[0]) setScheduleId(sch.schedules[0].id);
        }
      } finally {
        setFetching(false);
      }
    }

    loadRunContext();
  }, [open, workflow.id]);

  function validateParams(): Record<string, unknown> | null {
    try {
      const parsed = JSON.parse(paramsJson);
      if (typeof parsed !== "object" || Array.isArray(parsed) || parsed === null) {
        setParamsError("Params must be a JSON object {}");
        return null;
      }
      setParamsError(null);
      return parsed as Record<string, unknown>;
    } catch {
      setParamsError("Invalid JSON");
      return null;
    }
  }

  async function handleRun() {
    const params = validateParams();
    if (params === null) return;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/workflows/${workflow.id}/run`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId: selectedSession || undefined,
          scheduledWorkflowId: scheduleId || undefined,
          params,
        }),
      });

      const body = (await res.json()) as { success?: boolean; executionLogId?: string; error?: string };

      if (!res.ok) {
        setError(body.error ?? "Failed to start workflow");
        return;
      }

      setSuccessId(body.executionLogId ?? "");
      if (body.executionLogId) onSuccess?.(body.executionLogId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Play className="w-4 h-4 text-primary" />
            Run Workflow
          </DialogTitle>
          <DialogDescription className="text-sm">
            Manually trigger <span className="font-medium text-foreground">{workflow.name}</span>
          </DialogDescription>
        </DialogHeader>

        {successId ? (
          <div className="py-4">
            <div className="flex items-start gap-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-3">
              <Terminal className="w-4 h-4 text-green-600 dark:text-green-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-green-800 dark:text-green-300">
                  Workflow queued successfully
                </p>
                <p className="text-xs text-green-700 dark:text-green-400 mt-0.5 font-mono break-all">
                  Log ID: {successId}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            {/* Session selector */}
            {fetching ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Loading sessions…
              </div>
            ) : sessions.length === 0 ? (
              <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-3 text-sm text-amber-800 dark:text-amber-300">
                No active MCP sessions found. Connect an MCP server in the{" "}
                <a href="/mcp" className="underline font-medium">
                  MCP page
                </a>{" "}
                first.
              </div>
            ) : sessions.length > 1 ? (
              <div className="space-y-1.5">
                <Label htmlFor="session-select">MCP Session</Label>
                <Select value={selectedSession} onValueChange={setSelectedSession}>
                  <SelectTrigger id="session-select">
                    <SelectValue placeholder="Select a session" />
                  </SelectTrigger>
                  <SelectContent>
                    {sessions.map((s) => (
                      <SelectItem key={s.session_id} value={s.session_id}>
                        {s.server_id ?? s.session_id.slice(0, 12) + "…"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            {/* Params */}
            <div className="space-y-1.5">
              <Label htmlFor="run-params">
                Params{" "}
                <span className="text-muted-foreground font-normal text-xs">(JSON object)</span>
              </Label>
              <Textarea
                id="run-params"
                value={paramsJson}
                onChange={(e) => {
                  setParamsJson(e.target.value);
                  setParamsError(null);
                }}
                rows={4}
                className="font-mono text-xs"
                placeholder="{}"
              />
              {paramsError && <p className="text-xs text-destructive">{paramsError}</p>}
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
            {successId ? "Close" : "Cancel"}
          </Button>
          {!successId && (
            <Button
              onClick={handleRun}
              disabled={loading || fetching || sessions.length === 0}
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Running…
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  Run Now
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
