"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import {
  MoreHorizontal,
  Share2,
  Pencil,
  Settings,
  Folder,
  PinOff,
  Pin,
  Trash2,
  LogOut,
} from "lucide-react";
import { toast } from "react-hot-toast";
import { useUpdateProject, useDeleteProject, useLeaveProject } from "@/lib/hooks/use-projects";
import type { Project } from "@/lib/projects";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
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
import { Button } from "@/components/ui/button";

export interface ProjectContextMenuProps {
  project: Project;
  onProjectUpdated?: () => void;
  onProjectDeleted?: (projectId: string) => void;
  onShareProject?: (project: Project) => void;
}

export function ProjectContextMenu({
  project,
  onProjectUpdated,
  onProjectDeleted,
  onShareProject,
}: ProjectContextMenuProps) {
  const router = useRouter();
  const pathname = usePathname();
  const updateProject = useUpdateProject();
  const deleteProject = useDeleteProject();
  const leaveProject = useLeaveProject();

  const [open, setOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [renameName, setRenameName] = useState(project.name);

  const isCollaborator = Boolean(project.role && project.role !== "owner");

  const handleShare = async () => {
    try {
      const url = `${window.location.origin}/projects/${project.id}`;
      await navigator.clipboard.writeText(url);
      toast.success("Project link copied to clipboard");
    } catch {
      toast.error("Failed to copy project link");
    }
  };

  const handleRenameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = renameName.trim();
    if (!trimmed || updateProject.isPending) return;
    try {
      await updateProject.mutateAsync({ id: project.id, name: trimmed });
      toast.success("Project renamed");
      setRenameOpen(false);
      onProjectUpdated?.();
    } catch {
      // Handled by mutation toast
    }
  };

  const handleTogglePin = async () => {
    const nextPinned = !project.is_pinned;
    try {
      await updateProject.mutateAsync({ id: project.id, is_pinned: nextPinned });
      toast.success(nextPinned ? "Project pinned" : "Project unpinned");
      onProjectUpdated?.();
    } catch {
      // Handled by mutation toast
    }
  };

  const handleDelete = async () => {
    if (deleteProject.isPending) return;
    try {
      await deleteProject.mutateAsync(project.id);
      setDeleteOpen(false);
      onProjectDeleted?.(project.id);
      if (pathname === `/projects/${project.id}` || pathname.startsWith(`/projects/${project.id}/`)) {
        router.push("/");
      }
    } catch {
      // Handled by mutation toast
    }
  };

  const handleLeave = async () => {
    if (leaveProject.isPending) return;
    try {
      await leaveProject.mutateAsync(project.id);
      setLeaveOpen(false);
      if (pathname === `/projects/${project.id}` || pathname.startsWith(`/projects/${project.id}/`)) {
        router.push("/mcp");
      }
    } catch {
      // Handled by mutation toast
    }
  };

  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            onClick={(e) => e.stopPropagation()}
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/80 transition-colors"
            aria-label="Project actions"
          >
            <MoreHorizontal className="size-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48 text-xs">
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              setOpen(false);
              if (onShareProject) {
                onShareProject(project);
              } else {
                handleShare();
              }
            }}
            className="gap-2.5 py-2 cursor-pointer"
          >
            <Share2 className="size-4 text-muted-foreground" />
            <span>Share project</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              setOpen(false);
              setRenameName(project.name);
              setRenameOpen(true);
            }}
            className="gap-2.5 py-2 cursor-pointer"
          >
            <Pencil className="size-4 text-muted-foreground" />
            <span>Rename project</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              setOpen(false);
              router.push(`/projects/${project.id}?tab=settings`);
            }}
            className="gap-2.5 py-2 cursor-pointer"
          >
            <Settings className="size-4 text-muted-foreground" />
            <span>Project settings</span>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link
              href={`/projects/${project.id}`}
              onClick={(e) => e.stopPropagation()}
              className="gap-2.5 py-2 cursor-pointer"
            >
              <Folder className="size-4 text-muted-foreground" />
              <span>Project home</span>
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              setOpen(false);
              handleTogglePin();
            }}
            className="gap-2.5 py-2 cursor-pointer"
          >
            {project.is_pinned ? (
              <><PinOff className="size-4 text-muted-foreground" /><span>Unpin project</span></>
            ) : (
              <><Pin className="size-4 text-muted-foreground" /><span>Pin project</span></>
            )}
          </DropdownMenuItem>
          {isCollaborator ? (
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                setOpen(false);
                setLeaveOpen(true);
              }}
              className="gap-2.5 py-2 cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10"
            >
              <LogOut className="size-4" />
              <span>Leave project</span>
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                setOpen(false);
                setDeleteOpen(true);
              }}
              className="gap-2.5 py-2 cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10"
            >
              <Trash2 className="size-4" />
              <span>Delete project</span>
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Rename Dialog */}
      <Dialog open={renameOpen} onOpenChange={(o) => !updateProject.isPending && setRenameOpen(o)}>
        <DialogContent className="sm:max-w-md" onOpenAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">Rename Project</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Enter a new name for this project.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleRenameSubmit} className="space-y-4 pt-2">
            <input
              type="text"
              value={renameName}
              disabled={updateProject.isPending}
              onChange={(e) => setRenameName(e.target.value)}
              className="w-full h-9 px-3 text-xs bg-background border border-border rounded-sm text-foreground focus:outline-none focus:border-primary font-sans disabled:opacity-50"
              placeholder="Enter new project name"
              autoFocus
            />
            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={updateProject.isPending}
                onClick={() => setRenameOpen(false)}
                className="h-8 px-3 text-xs cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={!renameName.trim() || updateProject.isPending}
                className="h-8 px-3 text-xs cursor-pointer"
              >
                {updateProject.isPending ? "Saving..." : "Save"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteOpen} onOpenChange={(o) => !deleteProject.isPending && setDeleteOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Project</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &ldquo;{project.name}&rdquo;? Associated chats will
              remain safe, but project files and instructions will be removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteProject.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDelete(); }}
              disabled={deleteProject.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 cursor-pointer"
            >
              {deleteProject.isPending ? "Deleting..." : "Delete project"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Leave Project Confirmation Dialog */}
      <AlertDialog open={leaveOpen} onOpenChange={(o) => !leaveProject.isPending && setLeaveOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave Project</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to leave &ldquo;{project.name}&rdquo;? You will lose access
              and will need to be re-invited to rejoin.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={leaveProject.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleLeave(); }}
              disabled={leaveProject.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 cursor-pointer"
            >
              {leaveProject.isPending ? "Leaving..." : "Leave project"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
