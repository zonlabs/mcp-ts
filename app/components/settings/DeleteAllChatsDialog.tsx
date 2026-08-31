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

interface DeleteAllChatsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void>;
  chatCount?: number;
}

export function DeleteAllChatsDialog({
  open,
  onOpenChange,
  onConfirm,
  chatCount,
}: DeleteAllChatsDialogProps) {
  const [confirmText, setConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  const isConfirmed = confirmText.trim().toUpperCase() === "DELETE";

  const handleDelete = async () => {
    if (!isConfirmed || isDeleting) return;
    setIsDeleting(true);
    try {
      await onConfirm();
      setConfirmText("");
      onOpenChange(false);
    } catch (err) {
      console.error("Failed to delete all chats:", err);
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
          <div className="flex items-center gap-2.5 text-destructive">
            <div className="size-8 rounded-sm bg-destructive/10 border border-destructive/20 flex items-center justify-center">
              <AlertTriangle className="size-4 text-destructive" />
            </div>
            <AlertDialogTitle className="text-sm font-semibold tracking-tight text-foreground font-sans">
              Delete All Conversations?
            </AlertDialogTitle>
          </div>
          <AlertDialogDescription className="text-xs text-muted-foreground leading-relaxed">
            This will permanently delete{" "}
            {typeof chatCount === "number" && chatCount > 0 ? (
              <span className="font-semibold text-foreground">{chatCount} conversation{chatCount === 1 ? "" : "s"}</span>
            ) : (
              "all conversations"
            )}{" "}
            and revoke shared links.
            <span className="block mt-1 font-semibold text-destructive/90">
              This action cannot be undone.
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-2 pt-1">
          <label className="text-[11px] font-mono text-muted-foreground block">
            Type <span className="font-semibold text-foreground select-all">DELETE</span> to confirm:
          </label>
          <Input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="Type DELETE"
            className="h-8 px-3 text-xs font-mono bg-card border-border rounded-sm placeholder:font-sans focus-visible:ring-1 focus-visible:ring-destructive"
            disabled={isDeleting}
            autoFocus
          />
        </div>

        <AlertDialogFooter className="pt-2 gap-2 flex items-center justify-end">
          <AlertDialogCancel
            disabled={isDeleting}
            className="h-8 px-3 text-xs font-medium rounded-sm border-border hover:bg-card"
          >
            Cancel
          </AlertDialogCancel>
          <Button
            type="button"
            variant="destructive"
            disabled={!isConfirmed || isDeleting}
            onClick={handleDelete}
            className="h-8 px-3.5 text-xs font-medium rounded-sm bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-all disabled:opacity-40"
          >
            {isDeleting ? (
              <>
                <Loader2 className="size-3.5 mr-1.5 animate-spin" />
                Deleting...
              </>
            ) : (
              <>
                <Trash2 className="size-3.5 mr-1.5" />
                Delete All Chats
              </>
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
