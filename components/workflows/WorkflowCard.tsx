"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Play, Clock, Trash2, GitFork, MoreVertical, Braces } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  const router = useRouter();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [toggling, setToggling] = useState(false);

  async function handleActiveChange(checked: boolean) {
    if (checked === workflow.is_active) return;
    setToggling(true);
    try {
      await onToggleActive(workflow.id, checked);
    } finally {
      setToggling(false);
    }
  }

  return (
    <div className="group/row">
      <div
        className={cn(
          "flex flex-col gap-4 rounded-lg px-3 py-5 transition-colors sm:flex-row sm:items-center sm:gap-6 sm:px-4 lg:gap-8",
          "hover:bg-muted/40",
          !workflow.is_active && "opacity-[0.92]"
        )}
      >
        {/* Primary: open detail */}
        <button
          type="button"
          onClick={() => onView(workflow.id)}
          className={cn(
            "flex min-w-0 flex-1 gap-4 rounded-md text-left transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          )}
          aria-label={`Open workflow: ${workflow.name}`}
        >
          <div className="shrink-0 pt-0.5">
            {workflow.toolkits.length > 0 ? (
              <ToolkitGroup toolkits={workflow.toolkits} max={2} size="md" />
            ) : (
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted/50">
                <GitFork className="h-4 w-4 text-muted-foreground" aria-hidden />
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 gap-y-1">
              <h3 className="text-sm font-semibold leading-snug text-foreground group-hover/row:text-primary">
                {workflow.name}
              </h3>
              <Badge
                variant={workflow.is_active ? "default" : "secondary"}
                className={cn(
                  "shrink-0 text-[0.65rem] font-medium uppercase tracking-wide",
                  workflow.is_active &&
                    "border border-green-200 bg-green-100 text-green-800 dark:border-green-800 dark:bg-green-900/35 dark:text-green-400"
                )}
              >
                {workflow.is_active ? "Active" : "Inactive"}
              </Badge>
            </div>
            {workflow.description ? (
              <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                {workflow.description}
              </p>
            ) : null}
            <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span>
                {workflow.step_count} step{workflow.step_count !== 1 ? "s" : ""}
              </span>
              {workflow.schedule_count > 0 ? (
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3 w-3 shrink-0" aria-hidden />
                  {workflow.schedule_count} schedule{workflow.schedule_count !== 1 ? "s" : ""}
                </span>
              ) : null}
            </div>
          </div>
        </button>

        {/* Active checkbox + overflow menu */}
        <div className="flex shrink-0 items-center gap-3 self-end sm:self-center">
          <div className="flex items-center gap-2">
            <Checkbox
              id={`workflow-active-${workflow.id}`}
              checked={workflow.is_active}
              disabled={toggling}
              onCheckedChange={(value) => {
                if (value === "indeterminate") return;
                void handleActiveChange(value);
              }}
              aria-label={workflow.is_active ? "Deactivate workflow" : "Activate workflow"}
            />
            <Label
              htmlFor={`workflow-active-${workflow.id}`}
              className={cn(
                "cursor-pointer text-xs font-normal text-muted-foreground",
                toggling && "pointer-events-none opacity-60"
              )}
            >
              {toggling ? "Updating…" : workflow.is_active ? "Active" : "Inactive"}
            </Label>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 shrink-0 text-muted-foreground hover:text-foreground"
                aria-label={`More actions for ${workflow.name}`}
              >
                <MoreVertical className="h-4 w-4" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52" sideOffset={6}>
              <DropdownMenuItem
                className="gap-2"
                disabled={!workflow.is_active}
                onSelect={() => onRun(workflow)}
              >
                <Play className="h-4 w-4" aria-hidden />
                Run now
              </DropdownMenuItem>
              <DropdownMenuItem className="gap-2" onSelect={() => onSchedule(workflow)}>
                <Clock className="h-4 w-4" aria-hidden />
                Schedule
              </DropdownMenuItem>
              <DropdownMenuItem
                className="gap-2"
                onSelect={() => router.push(`/workflows/${workflow.id}?tab=default-inputs`)}
              >
                <Braces className="h-4 w-4" aria-hidden />
                Default inputs
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                className="gap-2"
                onSelect={() => setDeleteOpen(true)}
              >
                <Trash2 className="h-4 w-4" aria-hidden />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Workflow</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete{" "}
              <span className="font-semibold">{workflow.name}</span>? This will also delete all its
              steps, schedules, and execution history. This action cannot be undone.
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
    </div>
  );
}
