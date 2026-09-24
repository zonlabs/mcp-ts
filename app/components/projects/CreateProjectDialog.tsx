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
import { Label } from "@/components/ui/label";
import { Folder } from "lucide-react";
import { toast } from "react-hot-toast";
import { useCreateProject } from "@/lib/hooks/use-projects";
import type { Project } from "@/lib/projects";

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
  const createProject = useCreateProject();
  const [name, setName] = useState("");

  const handleClose = () => {
    if (!createProject.isPending) {
      onOpenChange(false);
      setName("");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error("Please enter a project name");
      return;
    }

    try {
      const project = await createProject.mutateAsync({ name: trimmedName });
      setName("");
      onOpenChange(false);

      if (onProjectCreated) {
        onProjectCreated(project);
      } else {
        router.push(`/projects/${project.id}`);
      }
    } catch {
      // Handled by useCreateProject onError toast
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[420px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <div className="flex items-center gap-2.5">
              <div className="size-8 rounded-sm bg-primary/10 text-primary flex items-center justify-center">
                <Folder className="size-4.5" />
              </div>
              <div>
                <DialogTitle className="text-base font-semibold">
                  New Project
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  Create a workspace to organize chats, files, and instructions.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="py-5 text-xs font-sans">
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
                className="h-9 text-xs"
                autoFocus
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t border-border">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleClose}
              disabled={createProject.isPending}
              className="text-xs cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={createProject.isPending || !name.trim()}
              className="text-xs cursor-pointer"
            >
              {createProject.isPending ? "Creating..." : "Create Project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
