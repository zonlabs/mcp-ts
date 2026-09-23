"use client";

import React from "react";
import { ShareDialog } from "./ShareDialog";

export interface ShareConversationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chatId?: string | null;
  shareVisibility: "PRIVATE" | "PUBLIC";
  shareCopyMessage?: string | null;
  onVisibilityChange: (value: "PRIVATE" | "PUBLIC") => void;
  onSaveShare?: (nextVisibility?: "PRIVATE" | "PUBLIC") => Promise<void>;
  onCopyShareLink?: () => Promise<void>;
}

export function ShareConversationDialog({
  open,
  onOpenChange,
  chatId,
  shareVisibility,
  onVisibilityChange,
}: ShareConversationDialogProps) {
  return (
    <ShareDialog
      open={open}
      onOpenChange={onOpenChange}
      type="chat"
      id={chatId}
      title="Share Chat"
      initialVisibility={shareVisibility}
      onVisibilityChange={onVisibilityChange}
    />
  );
}
