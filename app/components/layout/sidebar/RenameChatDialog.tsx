"use client";

import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export interface RenameChatDialogProps {
  editingChat: { id: string; title: string } | null;
  onClose: () => void;
  onRename: (id: string, title: string) => void;
  isPending?: boolean;
}

export function RenameChatDialog({
  editingChat,
  onClose,
  onRename,
  isPending = false,
}: RenameChatDialogProps) {
  const [title, setTitle] = useState(editingChat?.title || "");

  useEffect(() => {
    setTitle(editingChat?.title || "");
  }, [editingChat]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingChat || !title.trim() || isPending) return;
    onRename(editingChat.id, title.trim());
  };

  return (
    <Dialog
      open={Boolean(editingChat)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="w-[calc(100vw-2rem)] max-w-sm border-border bg-card p-5 text-foreground shadow-2xl">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold">Rename Chat</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Enter a new title for this chat.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <input
            type="text"
            value={title}
            disabled={isPending}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full h-9 px-3 text-xs bg-background border border-border rounded-sm text-foreground focus:outline-none focus:border-primary font-sans disabled:opacity-50"
            placeholder="Enter new chat title"
            autoFocus
          />
          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={isPending}
              onClick={onClose}
              className="h-8 px-3 text-xs cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={!title.trim() || isPending}
              className="h-8 px-3 text-xs cursor-pointer"
            >
              {isPending ? "Saving..." : "Save"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
