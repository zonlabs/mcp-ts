"use client";

import React, { useState } from "react";
import { Loader2, AlertTriangle, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface DeleteAllProjectsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void>;
  projectCount?: number;
}

export function DeleteAllProjectsDialog({
  open,
  onOpenChange,
  onConfirm,
  projectCount,
}: DeleteAllProjectsDialogProps) {
  const [confirmText, setConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  const isConfirmed = confirmText.trim() === "DELETE";

  const handleDelete = async () => {
    if (!isConfirmed || isDeleting) return;
    setIsDeleting(true);
    try {
      await onConfirm();
      setConfirmText("");
      onOpenChange(false);
    } catch (err) {
      console.error("Failed to delete all projects:", err);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!isDeleting) {
          if (!next) setConfirmText("");
          onOpenChange(next);
        }
      }}
    >
      <AlertDialogContent className="bg-background border border-border rounded-md shadow-none max-w-md p-5 space-y-4">
        <AlertDialogHeader className="space-y-2 text-left">
          <div className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="size-4.5" />
            <AlertDialogTitle className="text-sm font-semibold tracking-tight text-foreground font-sans">
              Delete all projects
            </AlertDialogTitle>
          </div>
          <AlertDialogDescription className="text-xs text-muted-foreground leading-relaxed">
            This will permanently delete all {projectCount !== undefined ? `${projectCount} ` : ""}
            projects, their custom instructions, and all attached files from storage. Chats will be preserved but unlinked from projects.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-2 bg-muted/40 p-3 rounded-sm border border-border/50">
          <p className="text-[11px] font-medium text-foreground">
            Type <span className="font-mono font-bold text-destructive">DELETE</span> to confirm:
          </p>
          <Input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="DELETE"
            disabled={isDeleting}
            className="h-8 text-xs font-mono bg-background border-border"
          />
        </div>

        <AlertDialogFooter className="flex-row items-center justify-end gap-2 pt-2">
          <AlertDialogCancel
            disabled={isDeleting}
            className="h-8 px-3 text-xs font-medium rounded-sm border-border hover:bg-muted mt-0"
          >
            Cancel
          </AlertDialogCancel>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={handleDelete}
            disabled={!isConfirmed || isDeleting}
            className="h-8 px-3 text-xs font-medium rounded-sm transition-all"
          >
            {isDeleting ? (
              <>
                <Loader2 className="size-3 mr-1.5 animate-spin" />
                Deleting...
              </>
            ) : (
              <>
                <Trash2 className="size-3 mr-1.5" />
                Delete All Projects
              </>
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
