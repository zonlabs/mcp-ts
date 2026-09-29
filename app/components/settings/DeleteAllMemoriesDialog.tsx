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

interface DeleteAllMemoriesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void>;
}

export function DeleteAllMemoriesDialog({
  open,
  onOpenChange,
  onConfirm,
}: DeleteAllMemoriesDialogProps) {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch (err) {
      console.error("Failed to delete all memories:", err);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="bg-background border border-border rounded-md shadow-none max-w-md p-5 space-y-4">
        <AlertDialogHeader className="space-y-2 text-left">
          <div className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="size-4.5" />
            <AlertDialogTitle className="text-sm font-semibold tracking-tight text-foreground font-sans">
              Delete all memories
            </AlertDialogTitle>
          </div>
          <AlertDialogDescription className="text-xs text-muted-foreground leading-relaxed">
            This will permanently delete all stored developer preferences, learned facts, and long-term user context. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>

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
            disabled={isDeleting}
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
                Delete All Memories
              </>
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
