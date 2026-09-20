"use client";

import React, { useState } from "react";
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
import { Folder, Brain, Lock, Globe, Sparkles } from "lucide-react";
import { toast } from "react-hot-toast";
import type { Project, MemoryScope } from "@/lib/projects";

interface CreateProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onProjectCreated?: (project: Project) => void;
}

export function CreateProjectDialog({
  open,
  onOpenChange,
  onProjectCreated,
}: CreateProjectDialogProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [customInstructions, setCustomInstructions] = useState("");
  const [memoryScope, setMemoryScope] = useState<MemoryScope>("global");
  const [visibility, setVisibility] = useState<"PRIVATE" | "PUBLIC">("PRIVATE");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const resetForm = () => {
    setName("");
    setDescription("");
    setCustomInstructions("");
    setMemoryScope("global");
    setVisibility("PRIVATE");
  };

  const handleClose = () => {
    if (!isSubmitting) {
      onOpenChange(false);
      resetForm();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error("Please enter a project name");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmedName,
          description: description.trim() || null,
          custom_instructions: customInstructions.trim() || null,
          memory_scope: memoryScope,
          visibility,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to create project");
      }

      toast.success("Project created successfully");
      handleClose();

      if (onProjectCreated) {
        onProjectCreated(data.project);
      } else {
        router.push(`/projects/${data.project.id}`);
      }
    } catch (err: any) {
      console.error("[CreateProjectDialog] Error:", err);
      toast.error(err.message || "Failed to create project");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[540px] max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <div className="flex items-center gap-2.5">
              <div className="size-8 rounded-md bg-primary/10 text-primary flex items-center justify-center">
                <Folder className="size-4.5" />
              </div>
              <div>
                <DialogTitle className="text-base font-semibold">
                  New Project
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  Workspaces keep chats, custom instructions, and memories organized.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 py-4 text-xs font-sans">
            {/* Project Name */}
            <div className="space-y-1.5">
              <Label htmlFor="project-name" className="text-xs font-medium">
                Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="project-name"
                placeholder="e.g. Next.js Architecture, Financial Research"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
                required
                className="h-8.5 text-xs"
                autoFocus
              />
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label htmlFor="project-desc" className="text-xs font-medium">
                Description (optional)
              </Label>
              <Input
                id="project-desc"
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
                <Label htmlFor="project-instructions" className="text-xs font-medium flex items-center gap-1.5">
                  <Sparkles className="size-3 text-primary" />
                  <span>Custom instructions (optional)</span>
                </Label>
                <span className="text-[10px] text-muted-foreground">
                  Applied to every chat in this project
                </span>
              </div>
              <Textarea
                id="project-instructions"
                placeholder="What should LinkOS know about this project? (e.g. 'Always answer in TypeScript', 'Focus on clean architecture', 'Assume we are building with Supabase & Tailwind')"
                value={customInstructions}
                onChange={(e) => setCustomInstructions(e.target.value)}
                rows={3}
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

            {/* Visibility */}
            <div className="space-y-1.5 pt-1">
              <Label className="text-xs font-medium">Visibility</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setVisibility("PRIVATE")}
                  className={`flex items-center gap-2 p-2 rounded-md border text-left transition-colors cursor-pointer ${
                    visibility === "PRIVATE"
                      ? "border-primary bg-primary/5 text-foreground"
                      : "border-border text-muted-foreground hover:text-foreground hover:bg-card"
                  }`}
                >
                  <Lock className="size-3.5 shrink-0" />
                  <div>
                    <span className="font-medium text-xs block">Private</span>
                    <span className="text-[10px] text-muted-foreground block">
                      Only visible to you
                    </span>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setVisibility("PUBLIC")}
                  className={`flex items-center gap-2 p-2 rounded-md border text-left transition-colors cursor-pointer ${
                    visibility === "PUBLIC"
                      ? "border-primary bg-primary/5 text-foreground"
                      : "border-border text-muted-foreground hover:text-foreground hover:bg-card"
                  }`}
                >
                  <Globe className="size-3.5 shrink-0" />
                  <div>
                    <span className="font-medium text-xs block">Public</span>
                    <span className="text-[10px] text-muted-foreground block">
                      Shareable with others
                    </span>
                  </div>
                </button>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t border-border">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleClose}
              disabled={isSubmitting}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isSubmitting || !name.trim()}
              className="text-xs"
            >
              {isSubmitting ? "Creating..." : "Create Project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
