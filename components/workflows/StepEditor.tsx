"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2, ChevronUp, ChevronDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { StepFormDialog } from "./StepFormDialog";
import type { WorkflowStep } from "@/types/workflows";
import { cn } from "@/lib/utils";

interface StepEditorProps {
  workflowId: string;
  steps: WorkflowStep[];
  onStepsChanged: (steps: WorkflowStep[]) => void;
}

export function StepEditor({ workflowId, steps, onStepsChanged }: StepEditorProps) {
  const [formOpen, setFormOpen] = useState(false);
  const [editingStep, setEditingStep] = useState<WorkflowStep | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [swapping, setSwapping] = useState<string | null>(null);

  function openAdd() {
    setEditingStep(null);
    setFormOpen(true);
  }

  function openEdit(step: WorkflowStep) {
    setEditingStep(step);
    setFormOpen(true);
  }

  function handleSaved(saved: WorkflowStep) {
    if (editingStep) {
      onStepsChanged(steps.map((s) => (s.id === saved.id ? saved : s)));
    } else {
      onStepsChanged([...steps, saved]);
    }
  }

  async function handleDelete() {
    if (!deleteId) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/workflows/${workflowId}/steps/${deleteId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        const remaining = steps
          .filter((s) => s.id !== deleteId)
          .map((s, idx) => ({ ...s, step_number: idx + 1 }));
        onStepsChanged(remaining);
      }
    } finally {
      setDeleting(false);
      setDeleteId(null);
    }
  }

  async function swapOrder(stepId: string, direction: "up" | "down") {
    const idx = steps.findIndex((s) => s.id === stepId);
    if (idx < 0) return;
    const targetIdx = direction === "up" ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= steps.length) return;

    setSwapping(stepId);

    const a = steps[idx];
    const b = steps[targetIdx];

    try {
      await Promise.all([
        fetch(`/api/workflows/${workflowId}/steps/${a.id}`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ step_number: b.step_number }),
        }),
        fetch(`/api/workflows/${workflowId}/steps/${b.id}`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ step_number: a.step_number }),
        }),
      ]);

      const newSteps = [...steps];
      newSteps[idx] = { ...b, step_number: a.step_number };
      newSteps[targetIdx] = { ...a, step_number: b.step_number };
      newSteps.sort((x, y) => x.step_number - y.step_number);
      onStepsChanged(newSteps);
    } finally {
      setSwapping(null);
    }
  }

  return (
    <>
      <div className="space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">
            Steps
            {steps.length > 0 && (
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                ({steps.length})
              </span>
            )}
          </h3>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={openAdd}>
            <Plus className="w-3.5 h-3.5" />
            Add Step
          </Button>
        </div>

        {/* Empty state */}
        {steps.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center rounded-xl border border-dashed border-border">
            <p className="text-sm text-muted-foreground">No steps yet</p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              Add steps to define what this workflow does
            </p>
            <Button size="sm" className="mt-4 gap-1.5" onClick={openAdd}>
              <Plus className="w-3.5 h-3.5" />
              Add First Step
            </Button>
          </div>
        )}

        {/* Step list */}
        {steps.map((step, idx) => {
          const isAI = step.toolkit === "ai";
          const args = step.tool_arguments ?? {};
          const promptPreview = isAI
            ? ((args.user_prompt as string) ?? "").slice(0, 100)
            : null;

          return (
            <div
              key={step.id}
              className={cn(
                "flex items-start gap-3 rounded-lg border border-border bg-card px-4 py-3",
                "group hover:border-border/80 hover:shadow-sm transition-all"
              )}
            >
              {/* Step number + reorder */}
              <div className="flex flex-col items-center gap-0.5 shrink-0 pt-0.5">
                <button
                  disabled={idx === 0 || !!swapping}
                  onClick={() => swapOrder(step.id, "up")}
                  className="p-0.5 rounded hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Move up"
                >
                  <ChevronUp className="w-3 h-3 text-muted-foreground" />
                </button>
                <div className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-semibold flex items-center justify-center">
                  {swapping === step.id ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    idx + 1
                  )}
                </div>
                <button
                  disabled={idx === steps.length - 1 || !!swapping}
                  onClick={() => swapOrder(step.id, "down")}
                  className="p-0.5 rounded hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Move down"
                >
                  <ChevronDown className="w-3 h-3 text-muted-foreground" />
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <ToolkitBadge toolkit={step.toolkit} size="sm" />
                  <span className="text-sm font-medium text-foreground truncate">
                    {step.name}
                  </span>
                </div>
                <p className="text-xs font-mono text-muted-foreground mt-0.5">
                  {step.tool_slug}
                </p>
                {promptPreview && (
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
                    {promptPreview}
                    {(args.user_prompt as string)?.length > 100 ? "…" : ""}
                  </p>
                )}
              </div>

              {/* Meta + actions */}
              <div className="flex items-center gap-1.5 shrink-0">
                <Badge variant="outline" className="text-xs">
                  {step.toolkit}
                </Badge>
                {step.retry_on_failure && (
                  <span className="text-xs text-muted-foreground">
                    ×{step.max_retries}
                  </span>
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={() => openEdit(step)}
                  title="Edit step"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={() => setDeleteId(step.id)}
                  title="Delete step"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Step form dialog */}
      <StepFormDialog
        workflowId={workflowId}
        step={editingStep}
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditingStep(null);
        }}
        onSaved={handleSaved}
      />

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Step</AlertDialogTitle>
            <AlertDialogDescription>
              This step will be permanently removed and remaining steps will be re-numbered.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Deleting…
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
