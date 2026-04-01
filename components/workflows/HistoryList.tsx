"use client";

import { CheckCircle2, XCircle, Clock, Loader2, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ToolkitBadge } from "./ToolkitBadge";
import type { ExecutionLog } from "@/types/workflow";
import { cn } from "@/lib/utils";

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

function HistoryRow({ log, onViewWorkflow }: { log: ExecutionLog; onViewWorkflow?: (id: string) => void }) {
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

      {/* View button */}
      <Button
        size="sm"
        variant="outline"
        className="shrink-0 h-7 px-2.5 text-xs gap-1"
        onClick={() => onViewWorkflow?.(log.workflow_id)}
      >
        View Recipe
        <ChevronRight className="w-3 h-3" />
      </Button>
    </div>
  );
}

export function HistoryList({ logs, loading, onViewWorkflow }: HistoryListProps) {
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
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {logs.map((log) => (
        <HistoryRow key={log.id} log={log} onViewWorkflow={onViewWorkflow} />
      ))}
    </div>
  );
}
