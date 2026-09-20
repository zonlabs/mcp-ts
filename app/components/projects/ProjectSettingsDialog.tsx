"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Settings, Brain, Lock, Globe, Sparkles, Trash2, Pin, PinOff } from "lucide-react";
import { toast } from "react-hot-toast";
import type { Project, MemoryScope } from "@/lib/projects";

interface ProjectSettingsDialogProps {
  project: Project;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onProjectUpdated?: (project: Project) => void;
  onProjectDeleted?: (projectId: string) => void;
}

export function ProjectSettingsDialog({
  project,
  open,
  onOpenChange,
  onProjectUpdated,
  onProjectDeleted,
}: ProjectSettingsDialogProps) {
  const router = useRouter();
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description || "");
  const [customInstructions, setCustomInstructions] = useState(project.custom_instructions || "");
  const [memoryScope, setMemoryScope] = useState<MemoryScope>(project.memory_scope || "global");
  const [visibility, setVisibility] = useState<"PRIVATE" | "PUBLIC">(project.visibility || "PRIVATE");
  const [isPinned, setIsPinned] = useState<boolean>(project.is_pinned || false);

  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Sync state when project changes
  useEffect(() => {
    if (open) {
      setName(project.name);
      setDescription(project.description || "");
      setCustomInstructions(project.custom_instructions || "");
      setMemoryScope(project.memory_scope || "global");
      setVisibility(project.visibility || "PRIVATE");
      setIsPinned(project.is_pinned || false);
    }
  }, [open, project]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error("Project name cannot be empty");
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmedName,
          description: description.trim() || null,
          custom_instructions: customInstructions.trim() || null,
          memory_scope: memoryScope,
          visibility,
          is_pinned: isPinned,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to update project");
      }

      toast.success("Project updated successfully");
      onOpenChange(false);

      if (onProjectUpdated) {
        onProjectUpdated(data.project);
      }
    } catch (err: any) {
      console.error("[ProjectSettingsDialog] Update failed:", err);
      toast.error(err.message || "Failed to update project");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "DELETE",
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to delete project");
      }

      toast.success("Project deleted");
      setShowDeleteConfirm(false);
      onOpenChange(false);

      if (onProjectDeleted) {
        onProjectDeleted(project.id);
      } else {
        router.push("/projects");
      }
    } catch (err: any) {
      console.error("[ProjectSettingsDialog] Delete failed:", err);
      toast.error(err.message || "Failed to delete project");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <div className="flex items-center gap-2.5">
                <div className="size-8 rounded-md bg-primary/10 text-primary flex items-center justify-center">
                  <Settings className="size-4.5" />
                </div>
                <div>
                  <DialogTitle className="text-base font-semibold">
                    Project Settings
                  </DialogTitle>
                  <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                    Manage project instructions, memory, library access, and sharing.
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="space-y-4 py-4 text-xs font-sans">
              {/* Project Name */}
              <div className="space-y-1.5">
                <Label htmlFor="edit-project-name" className="text-xs font-medium">
                  Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="edit-project-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={80}
                  required
                  className="h-8.5 text-xs"
                />
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <Label htmlFor="edit-project-desc" className="text-xs font-medium">
                  Description
                </Label>
                <Input
                  id="edit-project-desc"
                  placeholder="Short summary of this project's purpose"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={200}
                  className="h-8.5 text-xs"
                />
              </div>

              {/* Custom Instructions */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="edit-project-instructions" className="text-xs font-medium flex items-center gap-1.5">
                    <Sparkles className="size-3 text-primary" />
                    <span>Custom instructions</span>
                  </Label>
                  <span className="text-[10px] text-muted-foreground">
                    Applied to every chat in this project
                  </span>
                </div>
                <Textarea
                  id="edit-project-instructions"
                  placeholder="What should LinkOS know about this project? (e.g. coding conventions, architectural decisions, business context)"
                  value={customInstructions}
                  onChange={(e) => setCustomInstructions(e.target.value)}
                  rows={4}
                  className="text-xs resize-none"
                />
              </div>

              {/* Memory Scope */}
              <div className="space-y-1.5 pt-1">
                <Label className="text-xs font-medium flex items-center gap-1.5">
                  <Brain className="size-3.5 text-muted-foreground" />
                  <span>Memory Scope</span>
                </Label>
                <Select
                  value={memoryScope}
                  onValueChange={(val) => setMemoryScope(val as MemoryScope)}
                >
                  <SelectTrigger className="w-full h-8.5 text-xs">
                    <SelectValue placeholder="Select memory scope" />
                  </SelectTrigger>
                  <SelectContent className="text-xs">
                    <SelectItem value="global">Global (User & Project)</SelectItem>
                    <SelectItem value="project">Project only</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[10.5px] text-muted-foreground leading-tight pt-0.5">
                  {memoryScope === "global" && "Accesses global user memories and project context"}
                  {memoryScope === "project" && "Isolates memories strictly to this project"}
                </p>
              </div>

              {/* Visibility & Pinning */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Visibility</Label>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setVisibility("PRIVATE")}
                      className={`flex items-center gap-1.5 p-2 rounded-md border text-left transition-colors cursor-pointer ${
                        visibility === "PRIVATE"
                          ? "border-primary bg-primary/5 text-foreground"
                          : "border-border text-muted-foreground hover:text-foreground hover:bg-card"
                      }`}
                    >
                      <Lock className="size-3.5 shrink-0" />
                      <span className="font-medium text-xs">Private</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setVisibility("PUBLIC")}
                      className={`flex items-center gap-1.5 p-2 rounded-md border text-left transition-colors cursor-pointer ${
                        visibility === "PUBLIC"
                          ? "border-primary bg-primary/5 text-foreground"
                          : "border-border text-muted-foreground hover:text-foreground hover:bg-card"
                      }`}
                    >
                      <Globe className="size-3.5 shrink-0" />
                      <span className="font-medium text-xs">Public</span>
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Pin to Top</Label>
                  <button
                    type="button"
                    onClick={() => setIsPinned(!isPinned)}
                    className={`w-full flex items-center justify-between p-2 rounded-md border text-left transition-colors cursor-pointer ${
                      isPinned
                        ? "border-primary bg-primary/5 text-foreground font-medium"
                        : "border-border text-muted-foreground hover:text-foreground hover:bg-card"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {isPinned ? (
                        <Pin className="size-3.5 text-primary fill-primary/20" />
                      ) : (
                        <PinOff className="size-3.5" />
                      )}
                      <span className="text-xs">{isPinned ? "Pinned" : "Not pinned"}</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground">
                      {isPinned ? "Shown first" : "Click to pin"}
                    </span>
                  </button>
                </div>
              </div>

              {/* Danger Zone */}
              <div className="pt-3 border-t border-border">
                <div className="flex items-center justify-between p-2.5 rounded-md border border-destructive/20 bg-destructive/5">
                  <div>
                    <span className="font-medium text-xs text-destructive block">
                      Delete Project
                    </span>
                    <span className="text-[11px] text-muted-foreground block">
                      Chats will remain saved, but will be unlinked from this project.
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => setShowDeleteConfirm(true)}
                    className="text-xs shrink-0"
                  >
                    <Trash2 className="size-3.5 mr-1" />
                    Delete
                  </Button>
                </div>
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t border-border">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onOpenChange(false)}
                disabled={isSaving}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={isSaving || !name.trim()}
                className="text-xs"
              >
                {isSaving ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Alert */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent className="sm:max-w-[420px]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base font-semibold text-destructive">
              Delete Project
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-muted-foreground">
              Are you sure you want to delete <strong className="text-foreground">{project.name}</strong>?
              This action cannot be undone. Any chats in this project will not be deleted, but they will be removed from this workspace.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting} className="text-xs">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 text-xs"
            >
              {isDeleting ? "Deleting..." : "Yes, Delete Project"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
