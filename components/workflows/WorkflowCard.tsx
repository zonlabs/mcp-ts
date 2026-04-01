"use client";

import { useState } from "react";
import { Play, Clock, Trash2, ChevronRight, ToggleLeft, ToggleRight, Loader2 } from "lucide-react";
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
import { ToolkitGroup } from "./ToolkitBadge";
import type { Workflow } from "@/types/workflow";
import { cn } from "@/lib/utils";

interface WorkflowCardProps {
  workflow: Workflow;
  onRun: (workflow: Workflow) => void;
  onSchedule: (workflow: Workflow) => void;
  onDelete: (id: string) => void;
  onToggleActive: (id: string, isActive: boolean) => void;
  onView: (id: string) => void;
}

export function WorkflowCard({
  workflow,
  onRun,
  onSchedule,
  onDelete,
  onToggleActive,
  onView,
}: WorkflowCardProps) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [toggling, setToggling] = useState(false);

  async function handleToggle() {
    setToggling(true);
    try {
      await onToggleActive(workflow.id, !workflow.is_active);
    } finally {
      setToggling(false);
    }
  }

  return (
    <>
      <div
        className={cn(
          "group relative flex items-start gap-4 rounded-xl border border-border bg-card px-5 py-4 transition-all",
          "hover:border-border/80 hover:shadow-sm",
          !workflow.is_active && "opacity-60"
        )}
      >
        {/* Toolkit icons */}
        <div className="pt-0.5">
          {workflow.toolkits.length > 0 ? (
            <ToolkitGroup toolkits={workflow.toolkits} max={2} size="md" />
          ) : (
            <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center">
              <span className="text-muted-foreground text-xs">—</span>
            </div>
          )}
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="font-semibold text-sm text-foreground truncate leading-snug">
                {workflow.name}
              </h3>
              {workflow.description && (
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">
                  {workflow.description}
                </p>
              )}
            </div>
            <Badge
              variant={workflow.is_active ? "default" : "secondary"}
              className={cn(
                "shrink-0 text-xs",
                workflow.is_active
                  ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800"
                  : ""
              )}
            >
              {workflow.is_active ? "Active" : "Inactive"}
            </Badge>
          </div>

          <div className="flex items-center gap-3 mt-2.5 text-xs text-muted-foreground">
            <span>{workflow.step_count} step{workflow.step_count !== 1 ? "s" : ""}</span>
            {workflow.schedule_count > 0 && (
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {workflow.schedule_count} schedule{workflow.schedule_count !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Run */}
          <Button
            size="sm"
            variant="default"
            className="h-8 px-3 text-xs gap-1.5"
            onClick={() => onRun(workflow)}
            disabled={!workflow.is_active}
            title="Run workflow now"
          >
            <Play className="w-3.5 h-3.5" />
            Run
          </Button>

          {/* Schedule */}
          <Button
            size="sm"
            variant="outline"
            className="h-8 px-3 text-xs gap-1.5"
            onClick={() => onSchedule(workflow)}
            title="Add or manage schedules"
          >
            <Clock className="w-3.5 h-3.5" />
            Schedule
          </Button>

          {/* View */}
          <Button
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0"
            onClick={() => onView(workflow.id)}
            title="View details"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>

          {/* Toggle active */}
          <Button
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0"
            onClick={handleToggle}
            disabled={toggling}
            title={workflow.is_active ? "Deactivate" : "Activate"}
          >
            {toggling ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : workflow.is_active ? (
              <ToggleRight className="w-4 h-4 text-green-600 dark:text-green-400" />
            ) : (
              <ToggleLeft className="w-4 h-4 text-muted-foreground" />
            )}
          </Button>

          {/* Delete */}
          <Button
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
            onClick={() => setDeleteOpen(true)}
            title="Delete workflow"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Workflow</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete{" "}
              <span className="font-semibold">{workflow.name}</span>? This will also delete all
              its steps, schedules, and execution history. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                setDeleteOpen(false);
                onDelete(workflow.id);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
