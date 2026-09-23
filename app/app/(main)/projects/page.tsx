"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Folder,
  Plus,
  Search,
  Pin,
  PinOff,
  MoreHorizontal,
  Settings,
  Trash2,
  Share2,
  Globe,
  Users,
  MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { CreateProjectDialog } from "@/components/projects/CreateProjectDialog";
import { ProjectsSkeleton } from "@/components/projects/ProjectsSkeleton";
import { useAuth } from "@/components/providers/AuthProvider";
import type { Project } from "@/lib/projects";
import { toast } from "react-hot-toast";

function formatRelativeTime(isoString?: string): string {
  if (!isoString) return "";
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function ProjectsPage() {
  const router = useRouter();
  const { userSession } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"all" | "mine" | "shared">("all");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  // Delete project state
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchProjects = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/projects");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load projects");
      setProjects(data.projects || []);
    } catch (err: any) {
      console.error("[ProjectsPage] Load failed:", err);
      toast.error(err.message || "Failed to load projects");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const handleProjectCreated = (newProject: Project) => {
    setProjects((prev) => [newProject, ...prev]);
  };

  const handleTogglePin = async (e: React.MouseEvent, project: Project) => {
    e.preventDefault();
    e.stopPropagation();
    const newPinned = !project.is_pinned;
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_pinned: newPinned }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update pin state");
      toast.success(newPinned ? "Project pinned" : "Project unpinned");
      setProjects((prev) =>
        prev.map((p) => (p.id === project.id ? { ...p, is_pinned: newPinned } : p))
      );
    } catch (err: any) {
      toast.error(err.message || "Failed to update pin state");
    }
  };

  const handleCopyLink = async (e: React.MouseEvent, projectId: string) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const url = `${window.location.origin}/projects/${projectId}`;
      await navigator.clipboard.writeText(url);
      toast.success("Project link copied");
    } catch {
      toast.error("Failed to copy link");
    }
  };

  const handleDeleteConfirm = async () => {
    if (!projectToDelete) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/projects/${projectToDelete.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete project");
      }
      toast.success("Project deleted");
      setProjects((prev) => prev.filter((p) => p.id !== projectToDelete.id));
      setProjectToDelete(null);
    } catch (err: any) {
      toast.error(err.message || "Failed to delete project");
    } finally {
      setIsDeleting(false);
    }
  };

  const currentUserId = userSession?.user?.id;

  const mineCount = useMemo(() => {
    return projects.filter((p) => p.user_id === currentUserId || p.role === "owner").length;
  }, [projects, currentUserId]);

  const sharedCount = useMemo(() => {
    return projects.filter(
      (p) => (p.role && p.role !== "owner") || (currentUserId && p.user_id !== currentUserId)
    ).length;
  }, [projects, currentUserId]);

  const filteredProjects = useMemo(() => {
    let list = [...projects];

    if (activeTab === "mine" && currentUserId) {
      list = list.filter((p) => p.user_id === currentUserId || p.role === "owner");
    } else if (activeTab === "shared" && currentUserId) {
      list = list.filter(
        (p) => (p.role && p.role !== "owner") || (currentUserId && p.user_id !== currentUserId)
      );
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.description && p.description.toLowerCase().includes(q)) ||
          (p.custom_instructions && p.custom_instructions.toLowerCase().includes(q))
      );
    }

    // Sort pinned first, then updated_at descending
    return list.sort((a, b) => {
      if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
      return new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime();
    });
  }, [projects, activeTab, searchQuery, currentUserId]);

  if (isLoading) {
    return <ProjectsSkeleton />;
  }

  return (
    <div className="flex-1 h-full min-h-0 overflow-y-auto">
      <div className="w-full max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-10 font-sans space-y-6 pb-24">
        {/* Top Header Row: 📁 Projects ... [New Project] */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <Folder className="size-6 text-foreground stroke-[2] shrink-0" />
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground truncate">
              Projects
            </h1>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="sm"
              onClick={() => setCreateDialogOpen(true)}
              className="h-8.5 px-3 text-xs font-medium cursor-pointer shadow-xs gap-1.5"
            >
              <Plus className="size-3.5" />
              <span>New Project</span>
            </Button>
          </div>
        </div>

        {/* Pill Tabs + Search (at bottom of header, no ChatInput) */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1 border-b border-border/40 pb-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab("all")}
              className={`px-3.5 py-1.5 text-xs font-medium rounded-sm transition-colors cursor-pointer ${
                activeTab === "all"
                  ? "bg-muted text-foreground border border-border shadow-xs font-semibold"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
              }`}
            >
              All ({projects.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("mine")}
              className={`px-3.5 py-1.5 text-xs font-medium rounded-sm transition-colors cursor-pointer ${
                activeTab === "mine"
                  ? "bg-muted text-foreground border border-border shadow-xs font-semibold"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
              }`}
            >
              Created by you ({mineCount})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("shared")}
              className={`px-3.5 py-1.5 text-xs font-medium rounded-sm transition-colors cursor-pointer ${
                activeTab === "shared"
                  ? "bg-muted text-foreground border border-border shadow-xs font-semibold"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
              }`}
            >
              Shared ({sharedCount})
            </button>
          </div>

          <div className="relative w-full sm:w-52">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search projects..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-8 text-xs bg-secondary/30 border-border/60"
            />
          </div>
        </div>

        {/* Projects List */}
        {filteredProjects.length === 0 ? (
          <div className="text-center py-16 text-xs text-muted-foreground/60 space-y-2">
            <p>{searchQuery ? `No projects matching "${searchQuery}"` : "No projects yet"}</p>
            {!searchQuery && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setCreateDialogOpen(true)}
                className="text-xs mt-2 cursor-pointer"
              >
                <Plus className="size-3.5 mr-1" />
                Create your first project
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-1 pt-1">
            <div className="space-y-0.5">
              {filteredProjects.map((project) => (
                <div
                  key={project.id}
                  className="group relative flex items-center justify-between py-3 px-3 -mx-3 rounded-sm hover:bg-secondary/30 transition-colors"
                >
                  <Link
                    href={`/projects/${project.id}`}
                    className="flex-1 min-w-0 pr-4 block"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[14px] font-semibold text-foreground group-hover:text-primary transition-colors truncate">
                        {project.name}
                      </span>
                      {project.is_pinned && (
                        <Pin className="size-3 text-primary fill-primary/20 shrink-0" />
                      )}
                      {project.role && project.role !== "owner" ? (
                        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground font-normal shrink-0">
                          <Users className="size-3" />
                          <span>Shared with you ({project.role})</span>
                        </span>
                      ) : project.shares_count && project.shares_count > 0 ? (
                        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground font-normal shrink-0">
                          <Users className="size-3" />
                          <span>Shared ({project.shares_count})</span>
                        </span>
                      ) : null}
                      {project.visibility === "PUBLIC" && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground font-normal shrink-0">
                          <Globe className="size-3" />
                          <span>Public</span>
                        </span>
                      )}
                    </div>
                    {project.description && (
                      <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5 font-normal">
                        {project.description}
                      </p>
                    )}
                    <div className="flex items-center gap-3 text-[11px] text-muted-foreground/60 font-mono mt-1">
                      <span>Updated {formatRelativeTime(project.updated_at || project.created_at)}</span>
                      {(project as any).chats_count !== undefined && (
                        <>
                          <span>•</span>
                          <span className="flex items-center gap-1">
                            <MessageSquare className="size-3" />
                            {(project as any).chats_count} chats
                          </span>
                        </>
                      )}
                    </div>
                  </Link>

                  {/* Actions dropdown */}
                  <div className="shrink-0 flex items-center gap-1">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className="size-8 rounded-sm flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors cursor-pointer"
                          aria-label="Project actions"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreHorizontal className="size-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44 text-xs font-sans">
                        <DropdownMenuItem
                          onClick={() => router.push(`/projects/${project.id}?tab=settings`)}
                          className="cursor-pointer"
                        >
                          <Settings className="size-3.5 mr-2 text-muted-foreground" />
                          <span>Project Settings</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => handleCopyLink(e, project.id)}
                          className="cursor-pointer"
                        >
                          <Share2 className="size-3.5 mr-2 text-muted-foreground" />
                          <span>Copy Link</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => handleTogglePin(e, project)}
                          className="cursor-pointer"
                        >
                          {project.is_pinned ? (
                            <>
                              <PinOff className="size-3.5 mr-2 text-muted-foreground" />
                              <span>Unpin Project</span>
                            </>
                          ) : (
                            <>
                              <Pin className="size-3.5 mr-2 text-muted-foreground" />
                              <span>Pin Project</span>
                            </>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            setProjectToDelete(project);
                          }}
                          className="cursor-pointer text-destructive focus:text-destructive"
                        >
                          <Trash2 className="size-3.5 mr-2" />
                          <span>Delete Project</span>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Delete Confirmation Alert */}
        <AlertDialog open={Boolean(projectToDelete)} onOpenChange={(open) => !open && setProjectToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete project?</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete &ldquo;{projectToDelete?.name}&rdquo;? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  handleDeleteConfirm();
                }}
                disabled={isDeleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {isDeleting ? "Deleting..." : "Delete Project"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Create Project Modal */}
        <CreateProjectDialog
          open={createDialogOpen}
          onOpenChange={setCreateDialogOpen}
          onProjectCreated={handleProjectCreated}
        />
      </div>
    </div>
  );
}
