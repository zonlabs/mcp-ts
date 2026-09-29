"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Link2, ChevronDown, Check, Loader2, Trash2 } from "lucide-react";
import { toast } from "react-hot-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export interface CollaboratorShare {
  id: string;
  email: string;
  role: "viewer" | "editor";
  created_at?: string;
}

export interface ShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type?: "chat" | "project";
  id?: string | null;
  title?: string;
  initialVisibility?: "PRIVATE" | "PUBLIC";
  onVisibilityChange?: (visibility: "PRIVATE" | "PUBLIC") => void;
  onSharesChange?: (shares: CollaboratorShare[]) => void;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ShareDialog({
  open,
  onOpenChange,
  type = "chat",
  id,
  title,
  initialVisibility = "PRIVATE",
  onVisibilityChange,
  onSharesChange,
}: ShareDialogProps) {
  const [visibility, setVisibility] = useState<"PRIVATE" | "PUBLIC">(initialVisibility);
  const [shares, setShares] = useState<CollaboratorShare[]>([]);
  const [emailInput, setEmailInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [copied, setCopied] = useState(false);
  const [updatingEmail, setUpdatingEmail] = useState<string | null>(null);

  const isProject = type === "project";
  const dialogTitle = title || (isProject ? "Share Project" : "Share Chat");
  const anyoneDescription = isProject
    ? "Anyone with the link can view the project, conversations, instructions, and files."
    : "Anyone with the link can view this conversation.";

  const apiBasePath = isProject ? `/api/projects/${id}/shares` : `/api/chats/${id}/shares`;

  // Fetch current shares and visibility when dialog opens
  const fetchShares = useCallback(async () => {
    if (!id || !open) return;
    setIsLoading(true);
    try {
      const res = await fetch(apiBasePath);
      if (!res.ok) {
        if (res.status === 404) return;
        throw new Error("Failed to load share settings");
      }
      const data = await res.json();
      if (data.visibility) {
        setVisibility(data.visibility);
      }
      if (Array.isArray(data.shares)) {
        setShares(data.shares);
      }
    } catch (err: any) {
      console.error("[ShareDialog] Error loading shares:", err);
    } finally {
      setIsLoading(false);
    }
  }, [id, open, apiBasePath]);

  useEffect(() => {
    if (open && id) {
      setVisibility(initialVisibility);
      setIsLoading(true);
      fetchShares();
      setEmailInput("");
      setCopied(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, id]);

  // Toggle "Anyone with the link" switch
  const handleToggleVisibility = async (checked: boolean) => {
    if (!id) return;
    const nextVisibility = checked ? "PUBLIC" : "PRIVATE";
    const prevVisibility = visibility;
    setVisibility(nextVisibility);

    try {
      const res = await fetch(apiBasePath, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visibility: nextVisibility }),
      });

      if (!res.ok) {
        throw new Error("Failed to update access setting");
      }

      onVisibilityChange?.(nextVisibility);

      toast.success(
        nextVisibility === "PUBLIC"
          ? "Public link access enabled"
          : "Public link access disabled"
      );
    } catch (err: any) {
      setVisibility(prevVisibility);
      onVisibilityChange?.(prevVisibility);
      toast.error(err.message || "Failed to update visibility");
    }
  };

  // Add collaborator by email
  const handleAddEmail = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!id) return;

    const trimmed = emailInput.trim().toLowerCase();
    if (!trimmed) return;

    if (!EMAIL_REGEX.test(trimmed)) {
      toast.error("Please enter a valid email address");
      return;
    }

    if (shares.some((s) => s.email.toLowerCase() === trimmed)) {
      toast("This email has already been invited");
      setEmailInput("");
      return;
    }

    setIsAdding(true);
    try {
      const res = await fetch(apiBasePath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed, role: "viewer" }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Failed to add email");
      }

      const newShare: CollaboratorShare = data.share || {
        id: crypto.randomUUID(),
        email: trimmed,
        role: "viewer",
      };

      const updatedShares = [...shares.filter((s) => s.email !== trimmed), newShare];
      setShares(updatedShares);
      setEmailInput("");
      onSharesChange?.(updatedShares);
      toast.success(`Access granted to ${trimmed}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to invite collaborator");
    } finally {
      setIsAdding(false);
    }
  };

  // Update collaborator role (Viewer / Editor)
  const handleUpdateRole = async (email: string, role: "viewer" | "editor") => {
    if (!id) return;
    setUpdatingEmail(email);

    // Optimistic update
    const updatedShares = shares.map((s) =>
      s.email.toLowerCase() === email.toLowerCase() ? { ...s, role } : s
    );
    setShares(updatedShares);

    try {
      const res = await fetch(apiBasePath, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role }),
      });

      if (!res.ok) {
        throw new Error("Failed to update role");
      }
      onSharesChange?.(updatedShares);
      toast.success(`Updated permission for ${email}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to update role");
      fetchShares(); // rollback
    } finally {
      setUpdatingEmail(null);
    }
  };

  // Remove collaborator
  const handleRemoveCollaborator = async (email: string) => {
    if (!id) return;
    setUpdatingEmail(email);

    // Optimistic removal
    const updatedShares = shares.filter((s) => s.email.toLowerCase() !== email.toLowerCase());
    setShares(updatedShares);

    try {
      const res = await fetch(`${apiBasePath}?email=${encodeURIComponent(email)}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        throw new Error("Failed to remove collaborator");
      }
      onSharesChange?.(updatedShares);
      toast.success(`Removed ${email}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to remove collaborator");
      fetchShares(); // rollback
    } finally {
      setUpdatingEmail(null);
    }
  };

  // Copy shareable link
  const handleCopyLink = async () => {
    if (!id) return;
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const shareUrl = isProject
      ? `${origin}/projects/${id}`
      : `${origin}/share/${id}`;

    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success("Link copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy link");
    }
  };

  const isAnyoneWithLink = visibility === "PUBLIC";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "w-[calc(100vw-2rem)] max-w-[460px] sm:max-w-[460px] p-5 sm:p-6",
          "border border-border bg-card text-card-foreground shadow-2xl rounded-md sm:rounded-md font-sans"
        )}
      >
        <DialogHeader className="space-y-1 text-left pb-1">
          <DialogTitle className="text-sm sm:text-base font-semibold tracking-tight text-foreground font-sans">
            {dialogTitle}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Share this {isProject ? "project" : "chat"} via public link or invite specific email addresses.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-5 pt-1">
            {/* Row 1: Anyone with the link */}
            <div className="flex items-center justify-between gap-4 py-1">
              <div className="space-y-1.5 flex-1">
                <Skeleton className="h-4 w-36 rounded-xs" />
                <Skeleton className="h-3 w-5/6 max-w-[300px] rounded-xs" />
              </div>
              <Skeleton className="h-5 w-9 rounded-full shrink-0" />
            </div>

            {/* Row 2: Specific emails */}
            <div className="space-y-2">
              <Skeleton className="h-3.5 w-24 rounded-xs" />
              <div className="flex items-center gap-2">
                <Skeleton className="h-9 flex-1 rounded-md" />
                <Skeleton className="h-9 w-14 rounded-md shrink-0" />
              </div>
            </div>

            {/* Row 3: Collaborators List placeholder */}
            <div className="space-y-2 p-2 rounded-md border border-border/40 bg-muted/10">
              <div className="flex items-center justify-between py-1">
                <Skeleton className="h-3.5 w-44 rounded-xs" />
                <Skeleton className="h-3.5 w-14 rounded-xs" />
              </div>
              <div className="flex items-center justify-between py-1">
                <Skeleton className="h-3.5 w-36 rounded-xs" />
                <Skeleton className="h-3.5 w-14 rounded-xs" />
              </div>
            </div>

            {/* Row 4: Footer */}
            <div className="pt-2 border-t border-border flex items-center justify-between">
              <Skeleton className="h-4 w-20 rounded-xs" />
            </div>
          </div>
        ) : (
          <div className="space-y-5 pt-1">
          {/* Row 1: Anyone with the link */}
          <div className="flex items-center justify-between gap-4 py-1">
            <div className="space-y-0.5">
              <label
                htmlFor="anyone-with-link-switch"
                className="text-xs sm:text-sm font-medium text-foreground cursor-pointer block select-none"
              >
                Anyone with the link
              </label>
              <p className="text-xs text-muted-foreground leading-normal max-w-[320px] sm:max-w-[340px]">
                {anyoneDescription}
              </p>
            </div>
            <Switch
              id="anyone-with-link-switch"
              checked={isAnyoneWithLink}
              onCheckedChange={handleToggleVisibility}
              className="cursor-pointer shrink-0"
            />
          </div>

          {/* Row 2: Specific emails */}
          <div className="space-y-2">
            <label className="text-xs sm:text-sm font-medium text-foreground block">
              Specific emails
            </label>
            <form onSubmit={handleAddEmail} className="flex items-center gap-2">
              <Input
                type="email"
                placeholder="Enter email here"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                disabled={isAdding}
                className={cn(
                  "h-9 text-xs bg-background border border-border text-foreground placeholder:text-muted-foreground",
                  "focus-visible:ring-1 focus-visible:ring-ring focus-visible:border-ring rounded-md flex-1 font-sans shadow-xs"
                )}
              />
              <Button
                type="submit"
                size="sm"
                disabled={!emailInput.trim() || isAdding}
                className={cn(
                  "h-9 px-4 rounded-md text-xs font-medium cursor-pointer shrink-0 transition-all",
                  "bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.98] disabled:opacity-50 shadow-xs"
                )}
              >
                {isAdding ? <Loader2 className="size-3.5 animate-spin" /> : "Add"}
              </Button>
            </form>
          </div>

          {/* Row 3: Collaborators List */}
          {shares.length > 0 && (
            <div className="space-y-1 max-h-[180px] overflow-y-auto pr-1 -mr-1 border border-border/60 bg-muted/20 rounded-md p-1.5">
              {shares.map((share) => {
                const isItemUpdating = updatingEmail === share.email;
                return (
                  <div
                    key={share.id || share.email}
                    className="flex items-center justify-between py-1.5 px-2 rounded-sm hover:bg-muted/50 transition-colors"
                  >
                    <span className="text-xs font-medium text-foreground truncate pr-3 select-all">
                      {share.email}
                    </span>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          disabled={isItemUpdating}
                          className={cn(
                            "inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground",
                            "transition-colors outline-none cursor-pointer capitalize font-medium shrink-0 px-1.5 py-0.5 rounded-sm hover:bg-muted/60"
                          )}
                        >
                          {isItemUpdating ? (
                            <Loader2 className="size-3 animate-spin" />
                          ) : (
                            <>
                              <span>{share.role === "editor" ? "Editor" : "Viewer"}</span>
                              <ChevronDown className="size-3 text-muted-foreground" />
                            </>
                          )}
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        className="w-36 bg-popover border border-border text-popover-foreground shadow-lg rounded-md p-1 text-xs font-sans"
                      >
                        <DropdownMenuItem
                          onClick={() => handleUpdateRole(share.email, "viewer")}
                          className="flex items-center justify-between py-1.5 px-2 cursor-pointer rounded-xs hover:bg-accent hover:text-accent-foreground text-xs"
                        >
                          <span>Viewer</span>
                          {share.role === "viewer" && <Check className="size-3.5 text-primary" />}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleUpdateRole(share.email, "editor")}
                          className="flex items-center justify-between py-1.5 px-2 cursor-pointer rounded-xs hover:bg-accent hover:text-accent-foreground text-xs"
                        >
                          <span>Editor</span>
                          {share.role === "editor" && <Check className="size-3.5 text-primary" />}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator className="bg-border my-1" />
                        <DropdownMenuItem
                          onClick={() => handleRemoveCollaborator(share.email)}
                          className="flex items-center gap-2 py-1.5 px-2 cursor-pointer text-destructive hover:bg-destructive/10 rounded-xs text-xs"
                        >
                          <Trash2 className="size-3.5" />
                          <span>Remove</span>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                );
              })}
            </div>
          )}

            {/* Row 4: Footer - Copy Link */}
            <div className="pt-2 border-t border-border flex items-center justify-between">
              <button
                type="button"
                onClick={handleCopyLink}
                className={cn(
                  "inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground",
                  "transition-colors cursor-pointer py-1 px-1 -ml-1 rounded-sm hover:bg-muted/40 focus:outline-none"
                )}
              >
                <Link2 className="size-3.5 -rotate-45" />
                <span>{copied ? "Link copied!" : "Copy Link"}</span>
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
