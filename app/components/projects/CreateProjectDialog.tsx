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
  const [name, setName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleClose = () => {
    if (!isSubmitting) {
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

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmedName }),
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
              disabled={isSubmitting}
              className="text-xs cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isSubmitting || !name.trim()}
              className="text-xs cursor-pointer"
            >
              {isSubmitting ? "Creating..." : "Create Project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
