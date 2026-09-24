"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
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
import { Brain, Lock, Globe, Sparkles, Trash2, Pin, PinOff } from "lucide-react";
import { toast } from "react-hot-toast";
import { useUpdateProject, useDeleteProject } from "@/lib/hooks/use-sidebar-projects";
import type { Project, MemoryScope } from "@/lib/projects";

interface ProjectSettingsTabProps {
  project: Project;
  onProjectUpdated?: (project: Project) => void;
  onProjectDeleted?: (projectId: string) => void;
}

export function ProjectSettingsTab({
  project,
  onProjectUpdated,
  onProjectDeleted,
}: ProjectSettingsTabProps) {
  const router = useRouter();
  const updateProject = useUpdateProject();
  const deleteProject = useDeleteProject();

  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description || "");
  const [customInstructions, setCustomInstructions] = useState(project.custom_instructions || "");
  const [memoryScope, setMemoryScope] = useState<MemoryScope>(project.memory_scope || "global");
  const [visibility, setVisibility] = useState<"PRIVATE" | "PUBLIC">(project.visibility || "PRIVATE");
  const [isPinned, setIsPinned] = useState<boolean>(project.is_pinned || false);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    setName(project.name);
    setDescription(project.description || "");
    setCustomInstructions(project.custom_instructions || "");
    setMemoryScope(project.memory_scope || "global");
    setVisibility(project.visibility || "PRIVATE");
    setIsPinned(project.is_pinned || false);
  }, [project]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error("Project name cannot be empty");
      return;
    }

    try {
      const updated = await updateProject.mutateAsync({
        id: project.id,
        name: trimmedName,
        description: description.trim() || null,
        custom_instructions: customInstructions.trim() || null,
        memory_scope: memoryScope,
        visibility,
        is_pinned: isPinned,
      });

      toast.success("Settings saved successfully");
      onProjectUpdated?.(updated);
    } catch {
      // Handled by mutation toast
    }
  };

  const handleDelete = async () => {
    try {
      await deleteProject.mutateAsync(project.id);
      setShowDeleteConfirm(false);
      if (onProjectDeleted) {
        onProjectDeleted(project.id);
      } else {
        router.push("/projects");
      }
    } catch {
      // Handled by mutation toast
    }
  };

  return (
    <div className="space-y-8 font-sans max-w-2xl">
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Name & Description */}
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="tab-proj-name" className="text-xs font-semibold text-foreground">
              Project Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="tab-proj-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              required
              className="h-9 text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tab-proj-desc" className="text-xs font-semibold text-foreground">
              Description
            </Label>
            <Textarea
              id="tab-proj-desc"
              placeholder="Short summary of this project's purpose"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
              rows={2}
              className="text-xs resize-y min-h-[64px] max-h-[180px] leading-relaxed"
            />
          </div>
        </div>

        {/* Custom Instructions */}
        <div className="space-y-1.5 pt-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="tab-proj-instructions" className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Sparkles className="size-3.5 text-primary" />
              <span>Custom Instructions</span>
            </Label>
            <span className="text-[11px] text-muted-foreground">Applied to all chats in this project</span>
          </div>
          <Textarea
            id="tab-proj-instructions"
            placeholder="What should the assistant know about this project? (e.g. 'Always answer in TypeScript', 'Focus on clean architecture', 'Assume we are building with Supabase & Tailwind')"
            value={customInstructions}
            onChange={(e) => setCustomInstructions(e.target.value)}
            rows={5}
            className="text-xs resize-y min-h-[110px] max-h-[400px] leading-relaxed"
          />
        </div>

        {/* Memory Scope */}
        <div className="space-y-1.5 pt-2">
          <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <Brain className="size-3.5 text-muted-foreground" />
            <span>Memory Scope</span>
          </Label>
          <Select
            value={memoryScope}
            onValueChange={(val) => setMemoryScope(val as MemoryScope)}
          >
            <SelectTrigger className="w-full h-9 text-xs">
              <SelectValue placeholder="Select memory scope" />
            </SelectTrigger>
            <SelectContent className="text-xs">
              <SelectItem value="global">Global (User & Project Memories)</SelectItem>
              <SelectItem value="project">Project Only (Isolated Memories)</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground pt-0.5">
            {memoryScope === "global"
              ? "Accesses global account memories alongside project context."
              : "Memories formed here are strictly isolated to this project."}
          </p>
        </div>

        {/* Visibility */}
        <div className="space-y-2 pt-2">
          <Label className="text-xs font-semibold text-foreground">Visibility</Label>
          <div className="grid grid-cols-2 gap-2.5 max-w-sm">
            <button
              type="button"
              onClick={() => setVisibility("PRIVATE")}
              className={`flex items-center gap-2 p-2.5 rounded-sm border text-left transition-colors cursor-pointer ${
                visibility === "PRIVATE"
                  ? "border-foreground/60 bg-muted text-foreground font-medium"
                  : "border-border text-muted-foreground hover:text-foreground hover:bg-muted/40"
              }`}
            >
              <Lock className="size-4 shrink-0" />
              <div>
                <span className="text-xs block leading-tight">Private</span>
                <span className="text-[10px] text-muted-foreground block">Only visible to you</span>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setVisibility("PUBLIC")}
              className={`flex items-center gap-2 p-2.5 rounded-sm border text-left transition-colors cursor-pointer ${
                visibility === "PUBLIC"
                  ? "border-foreground/60 bg-muted text-foreground font-medium"
                  : "border-border text-muted-foreground hover:text-foreground hover:bg-muted/40"
              }`}
            >
              <Globe className="size-4 shrink-0" />
              <div>
                <span className="text-xs block leading-tight">Public</span>
                <span className="text-[10px] text-muted-foreground block">Shareable with link</span>
              </div>
            </button>
          </div>
        </div>

        {/* Pin to Sidebar */}
        <div className="flex items-center justify-between gap-4 pt-3 pb-1 border-t border-border/40">
          <div>
            <span className="text-xs font-semibold text-foreground block">Pin to Sidebar</span>
            <span className="text-[11px] text-muted-foreground block">Keep this project pinned at the top of your sidebar.</span>
          </div>
          <Button
            type="button"
            variant={isPinned ? "secondary" : "outline"}
            size="sm"
            onClick={() => setIsPinned(!isPinned)}
            className="h-8 text-xs gap-1.5 cursor-pointer shrink-0"
          >
            {isPinned ? (
              <>
                <PinOff className="size-3.5" />
                <span>Unpin</span>
              </>
            ) : (
              <>
                <Pin className="size-3.5" />
                <span>Pin project</span>
              </>
            )}
          </Button>
        </div>

        {/* Save button */}
        <div className="pt-2">
          <Button
            type="submit"
            size="sm"
            disabled={updateProject.isPending || !name.trim()}
            className="text-xs px-5 h-8.5 cursor-pointer font-medium"
          >
            {updateProject.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </form>

      {/* Danger Zone */}
      <div className="pt-6 border-t border-destructive/20 space-y-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h4 className="text-xs font-semibold text-destructive">Delete Project</h4>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Permanently delete this project workspace and all attached knowledge files.
            </p>
          </div>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => setShowDeleteConfirm(true)}
            className="text-xs h-8 cursor-pointer shrink-0"
          >
            <Trash2 className="size-3.5 mr-1.5" />
            Delete Project
          </Button>
        </div>
      </div>

      {/* Delete Confirmation Alert */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete project?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &ldquo;{project.name}&rdquo;? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteProject.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
              disabled={deleteProject.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteProject.isPending ? "Deleting..." : "Delete Project"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
