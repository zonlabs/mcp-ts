"use client";

import { useCallback, useState } from "react";
import { CheckCircle2, XCircle, Clock, Loader2, ChevronRight, ScrollText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToolkitBadge } from "./ToolkitBadge";
import type { ExecutionLog } from "@/types/workflow";
import { cn } from "@/lib/utils";

type ExecutionLogDetail = {
  id: string;
  status: string;
  workflow_id: string;
  scheduled_workflow_id: string | null;
  job_id: string | null;
  retry_count: number | null;
  input_data: unknown;
  output_data: unknown;
  error_message: string | null;
  error_code: string | null;
  error_stack: unknown;
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
  created_at: string;
};

function getScriptStepLogs(outputData: unknown): { stdout: string; stderr: string } | null {
  if (!outputData || typeof outputData !== "object") return null;
  const steps = (outputData as Record<string, unknown>).steps;
  if (!steps || typeof steps !== "object") return null;
  const rec = steps as Record<string, unknown>;
  const step =
    rec["1"] ??
    Object.values(rec).find(
      (s) =>
        s &&
        typeof s === "object" &&
        (s as Record<string, unknown>).stepId === "script"
    );
  if (!step || typeof step !== "object") return null;
  const output = (step as Record<string, unknown>).output;
  if (!output || typeof output !== "object") return null;
  const logs = (output as Record<string, unknown>).logs;
  if (!logs || typeof logs !== "object") return null;
  const stdout = (logs as Record<string, unknown>).stdout;
  const stderr = (logs as Record<string, unknown>).stderr;
  const out = typeof stdout === "string" ? stdout : stdout != null ? String(stdout) : "";
  const err = typeof stderr === "string" ? stderr : stderr != null ? String(stderr) : "";
  if (!out && !err) return null;
  return { stdout: out, stderr: err };
}

function getScriptStepResult(outputData: unknown): unknown {
  if (!outputData || typeof outputData !== "object") return null;
  const steps = (outputData as Record<string, unknown>).steps;
  if (!steps || typeof steps !== "object") return null;
  const rec = steps as Record<string, unknown>;
  const step = rec["1"];
  if (!step || typeof step !== "object") return null;
  return (step as Record<string, unknown>).output ?? null;
}

interface HistoryListProps {
  logs: ExecutionLog[];
  loading?: boolean;
  onViewWorkflow?: (workflowId: string) => void;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso.endsWith("Z") ? iso : iso + "Z");
  if (isNaN(d.getTime())) return "—";
  return (
    d.toLocaleDateString(undefined, { day: "2-digit", month: "short" }) +
    ", " +
    d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: true })
  );
}

function formatDuration(ms: number | null): string {
  if (!ms) return "";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
}

function StatusBadge({ status }: { status: string }) {
  if (status === "success") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-700 dark:text-green-400">
        <CheckCircle2 className="w-3.5 h-3.5" />
        Success
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600 dark:text-red-400">
        <XCircle className="w-3.5 h-3.5" />
        Error
      </span>
    );
  }
  if (status === "running") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 dark:text-blue-400">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Running
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
      <Clock className="w-3.5 h-3.5" />
      Pending
    </span>
  );
}

function HistoryRow({
  log,
  onViewWorkflow,
  onOpenOutput,
}: {
  log: ExecutionLog;
  onViewWorkflow?: (id: string) => void;
  onOpenOutput?: (logId: string) => void;
}) {
  const descPreview = log.workflow?.description
    ? log.workflow.description.replace(/^#{1,3}\s*/gm, "").slice(0, 80)
    : log.error_message
    ? log.error_message.slice(0, 80)
    : null;

  return (
    <div
      className={cn(
        "flex items-center gap-4 px-4 py-3.5 border-b border-border last:border-0",
        "hover:bg-accent/30 transition-colors"
      )}
    >
      {/* Date */}
      <div className="w-28 shrink-0">
        <span className="text-xs text-muted-foreground tabular-nums">
          {formatDate(log.started_at ?? log.created_at)}
        </span>
      </div>

      {/* Status */}
      <div className="w-20 shrink-0">
        <StatusBadge status={log.status} />
      </div>

      {/* Toolkit icon (placeholder - no toolkit info in log directly) */}
      <div className="shrink-0">
        <ToolkitBadge toolkit="custom" size="sm" />
      </div>

      {/* Workflow name + description */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">
          {log.workflow?.name ?? "Unknown Workflow"}
        </p>
        {descPreview && (
          <p className="text-xs text-muted-foreground truncate mt-0.5">{descPreview}</p>
        )}
      </div>

      {/* Duration */}
      {log.duration_ms != null && (
        <div className="shrink-0 hidden sm:block">
          <Badge variant="secondary" className="text-xs font-mono">
            {formatDuration(log.duration_ms)}
          </Badge>
        </div>
      )}

      {/* Triggered by */}
      <div className="shrink-0 hidden md:block">
        <span className="text-xs text-muted-foreground capitalize">{log.triggered_by}</span>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <Button
          size="sm"
          variant="secondary"
          className="h-7 px-2.5 text-xs gap-1"
          type="button"
          onClick={() => onOpenOutput?.(log.id)}
        >
          <ScrollText className="w-3 h-3" />
          Output
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-2.5 text-xs gap-1"
          type="button"
          onClick={() => onViewWorkflow?.(log.workflow_id)}
        >
          Recipe
          <ChevronRight className="w-3 h-3" />
        </Button>
      </div>
    </div>
  );
}

function ExecutionOutputDialog({
  open,
  onOpenChange,
  log,
  loading,
  error,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  log: ExecutionLogDetail | null;
  loading: boolean;
  error: string | null;
}) {
  const scriptLogs = log ? getScriptStepLogs(log.output_data) : null;
  const scriptResult = log ? getScriptStepResult(log.output_data) : null;

  const logScrollClass =
    "max-h-[min(calc(90dvh-11rem),720px)] min-h-[12rem] overflow-y-auto overscroll-y-contain scroll-smooth rounded-md border bg-muted/40 p-3 [touch-action:pan-y]";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className={cn(
          "!flex !flex-col gap-0 overflow-hidden p-0",
          "h-[90dvh] max-h-[90dvh] w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] sm:h-[min(90dvh,880px)] sm:max-h-[min(90dvh,880px)] sm:max-w-3xl"
        )}
      >
        <DialogHeader className="shrink-0 space-y-1 border-b bg-background px-4 py-3 pr-12 sm:px-6 sm:py-4">
          <DialogTitle className="text-base sm:text-lg">Execution output</DialogTitle>
          <DialogDescription className="break-all font-mono text-[11px] leading-snug sm:text-xs">
            {log?.id ?? "—"}
            {log?.status ? ` · ${log.status}` : ""}
            {log?.duration_ms != null ? ` · ${log.duration_ms}ms` : ""}
          </DialogDescription>
        </DialogHeader>

        <div
          className={cn(
            "min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 py-3 sm:px-6 sm:py-4",
            "[touch-action:pan-y]"
          )}
        >
          {loading ? (
            <div className="flex items-center gap-2 py-12 justify-center text-muted-foreground text-sm">
              <Loader2 className="w-5 h-5 animate-spin shrink-0" />
              Loading execution log…
            </div>
          ) : error ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          ) : !log ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No data</p>
          ) : (
            <Tabs
              key={log.id}
              defaultValue={scriptLogs ? "logs" : "json"}
              className="flex w-full flex-col gap-3"
            >
              <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-muted/60 p-1">
                <TabsTrigger value="logs" disabled={!scriptLogs} className="text-xs sm:text-sm">
                  Script logs
                </TabsTrigger>
                <TabsTrigger value="result" className="text-xs sm:text-sm">
                  Script result
                </TabsTrigger>
                <TabsTrigger value="json" className="text-xs sm:text-sm">
                  output_data
                </TabsTrigger>
                <TabsTrigger value="input" className="text-xs sm:text-sm">
                  input_data
                </TabsTrigger>
              </TabsList>
              <TabsContent value="logs" className="mt-0 focus-visible:outline-none data-[state=inactive]:hidden">
                {scriptLogs ? (
                  <div className="space-y-3">
                    {scriptLogs.stdout ? (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">stdout</p>
                        <pre
                          className={cn(
                            "text-xs font-mono whitespace-pre-wrap break-words [overflow-wrap:anywhere]",
                            logScrollClass
                          )}
                        >
                          {scriptLogs.stdout}
                        </pre>
                      </div>
                    ) : null}
                    {scriptLogs.stderr ? (
                      <div>
                        <p className="text-xs font-medium text-destructive mb-1">stderr</p>
                        <pre
                          className={cn(
                            "text-xs font-mono whitespace-pre-wrap break-words border-destructive/30 bg-destructive/5 [overflow-wrap:anywhere]",
                            logScrollClass
                          )}
                        >
                          {scriptLogs.stderr}
                        </pre>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </TabsContent>
              <TabsContent value="result" className="mt-0 focus-visible:outline-none data-[state=inactive]:hidden">
                <pre
                  className={cn(
                    "text-xs font-mono whitespace-pre-wrap break-words [overflow-wrap:anywhere]",
                    logScrollClass
                  )}
                >
                  {scriptResult != null
                    ? JSON.stringify(scriptResult, null, 2)
                    : "(no script step output)"}
                </pre>
              </TabsContent>
              <TabsContent value="json" className="mt-0 focus-visible:outline-none data-[state=inactive]:hidden">
                <pre
                  className={cn(
                    "text-xs font-mono whitespace-pre-wrap break-words [overflow-wrap:anywhere]",
                    logScrollClass
                  )}
                >
                  {log.output_data != null
                    ? JSON.stringify(log.output_data, null, 2)
                    : "null"}
                </pre>
              </TabsContent>
              <TabsContent value="input" className="mt-0 focus-visible:outline-none data-[state=inactive]:hidden">
                <pre
                  className={cn(
                    "text-xs font-mono whitespace-pre-wrap break-words [overflow-wrap:anywhere]",
                    logScrollClass
                  )}
                >
                  {log.input_data != null
                    ? JSON.stringify(log.input_data, null, 2)
                    : "null"}
                </pre>
              </TabsContent>
            </Tabs>
          )}
        </div>

        {log?.error_message ? (
          <div className="shrink-0 border-t bg-muted/20 px-4 py-3 sm:px-6">
            <p className="text-xs font-medium text-destructive mb-1">error_message</p>
            <p className="text-xs text-muted-foreground break-words">{log.error_message}</p>
            {log.error_code ? (
              <p className="text-xs font-mono text-muted-foreground mt-1">code: {log.error_code}</p>
            ) : null}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export function HistoryList({ logs, loading, onViewWorkflow }: HistoryListProps) {
  const [outputOpen, setOutputOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailLog, setDetailLog] = useState<ExecutionLogDetail | null>(null);

  const openExecutionOutput = useCallback(async (logId: string) => {
    setOutputOpen(true);
    setDetailLog(null);
    setDetailError(null);
    setDetailLoading(true);
    try {
      const res = await fetch(
        `/api/workflows/execution-log?executionLogId=${encodeURIComponent(logId)}`
      );
      const body = (await res.json()) as { executionLog?: ExecutionLogDetail; error?: string };
      if (!res.ok) {
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      if (!body.executionLog) {
        throw new Error("Missing execution log");
      }
      setDetailLog(body.executionLog);
    } catch (e) {
      setDetailError(e instanceof Error ? e.message : "Failed to load execution log");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm">Loading history…</span>
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Clock className="w-10 h-10 text-muted-foreground/40 mb-3" />
        <p className="text-sm font-medium text-muted-foreground">No executions yet</p>
        <p className="text-xs text-muted-foreground/60 mt-1">
          Run a workflow to see its history here
        </p>
      </div>
    );
  }

  return (
    <>
      <ExecutionOutputDialog
        open={outputOpen}
        onOpenChange={setOutputOpen}
        log={detailLog}
        loading={detailLoading}
        error={detailError}
      />
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {logs.map((log) => (
          <HistoryRow
            key={log.id}
            log={log}
            onViewWorkflow={onViewWorkflow}
            onOpenOutput={openExecutionOutput}
          />
        ))}
      </div>
    </>
  );
}
