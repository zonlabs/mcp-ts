"use client";

import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Lock, Globe, Copy, Check, AlertCircle, Share2, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ShareConversationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chatId?: string | null;
  shareVisibility: "PRIVATE" | "PUBLIC";
  shareCopyMessage?: string | null;
  onVisibilityChange: (value: "PRIVATE" | "PUBLIC") => void;
  onSaveShare: (nextVisibility?: "PRIVATE" | "PUBLIC") => Promise<void>;
  onCopyShareLink: () => Promise<void>;
}

export function ShareConversationDialog({
  open,
  onOpenChange,
  chatId,
  shareVisibility,
  shareCopyMessage,
  onVisibilityChange,
  onSaveShare,
  onCopyShareLink,
}: ShareConversationDialogProps) {
  const [copied, setCopied] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const shareUrl = chatId ? `${origin}/share/${chatId}` : "";

  const handleCopy = async () => {
    if (!shareUrl) {
      await onCopyShareLink();
      return;
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      await onCopyShareLink();
    }
  };

  const handleVisibilityToggle = async (newVisibility: "PRIVATE" | "PUBLIC") => {
    if (newVisibility === shareVisibility || isUpdating) return;
    setIsUpdating(true);
    try {
      onVisibilityChange(newVisibility);
      await onSaveShare(newVisibility);
    } finally {
      setIsUpdating(false);
    }
  };

  const isPublic = shareVisibility === "PUBLIC";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-md border-border bg-card p-6 text-foreground shadow-2xl rounded-lg sm:max-w-md">
        <div className="space-y-5">
          {/* Header */}
          <DialogHeader className="space-y-1.5 text-left">
            <div className="flex items-center gap-2">
              <div className="size-8 rounded-md bg-muted/60 border border-border/80 flex items-center justify-center text-foreground">
                <Share2 className="size-4" />
              </div>
              <DialogTitle className="text-base font-semibold tracking-tight text-foreground">
                Share Conversation
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-muted-foreground leading-relaxed">
              Create a link to share this conversation with others.
            </DialogDescription>
          </DialogHeader>

          {/* Visibility Options Selector */}
          <div className="grid grid-cols-2 gap-2 p-1 bg-muted/40 rounded-lg border border-border/60">
            <button
              type="button"
              onClick={() => handleVisibilityToggle("PRIVATE")}
              disabled={isUpdating}
              className={cn(
                "flex items-center justify-center gap-2 py-2 px-3 rounded-md text-xs font-medium transition-all cursor-pointer",
                !isPublic
                  ? "bg-card text-foreground shadow-xs border border-border font-semibold"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
              )}
            >
              <Lock className="size-3.5 shrink-0" />
              <span>Private</span>
            </button>

            <button
              type="button"
              onClick={() => handleVisibilityToggle("PUBLIC")}
              disabled={isUpdating}
              className={cn(
                "flex items-center justify-center gap-2 py-2 px-3 rounded-md text-xs font-medium transition-all cursor-pointer",
                isPublic
                  ? "bg-card text-foreground shadow-xs border border-border font-semibold"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
              )}
            >
              <Globe className="size-3.5 shrink-0" />
              <span>Public Access</span>
            </button>
          </div>

          {/* Dynamic Content based on Visibility */}
          {isPublic ? (
            <div className="space-y-3 animate-in fade-in-50 duration-200">
              <div className="space-y-1.5">
                <label className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider font-medium">
                  Public Share Link
                </label>
                <div className="flex items-center gap-2">
                  <Input
                    readOnly
                    value={shareUrl || "Generating link..."}
                    className="h-9 text-xs font-mono bg-background border-border text-foreground select-all rounded-md flex-1"
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                  />
                  <Button
                    type="button"
                    onClick={handleCopy}
                    size="sm"
                    className="h-9 px-3 text-xs gap-1.5 shrink-0 cursor-pointer"
                  >
                    {copied || shareCopyMessage ? (
                      <>
                        <Check className="size-3.5 text-emerald-500" />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="size-3.5" />
                        <span>Copy</span>
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3 py-1 animate-in fade-in-50 duration-200">
              <div className="rounded-md border border-border/80 bg-background/50 p-3.5 text-center space-y-2">
                <div className="size-7 rounded-full bg-muted flex items-center justify-center mx-auto text-muted-foreground">
                  <Lock className="size-3.5" />
                </div>
                <p className="text-xs text-muted-foreground max-w-xs mx-auto leading-relaxed">
                  This conversation is private. Switch to <strong className="text-foreground font-medium">Public Access</strong> to generate a shareable link.
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => handleVisibilityToggle("PUBLIC")}
                  disabled={isUpdating}
                  className="text-xs h-8 gap-1.5 mt-1 border-border bg-card hover:bg-accent cursor-pointer"
                >
                  <Globe className="size-3.5" />
                  <span>Enable Public Sharing</span>
                </Button>
              </div>
            </div>
          )}

          {/* Subtle Warning Footer */}
          <div className="flex items-start gap-2.5 rounded-md bg-amber-500/10 border border-amber-500/20 px-3 py-2.5 text-amber-700 dark:text-amber-300">
            <AlertCircle className="size-4 shrink-0 mt-0.5" />
            <p className="text-[11px] leading-relaxed">
              Shared conversations include visible messages and tool executions. Review content before sharing publicly.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
