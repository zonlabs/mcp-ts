"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Folder,
  Pin,
  PinOff,
  MoreHorizontal,
  Settings,
  Trash2,
  Share2,
  Lock,
  Globe,
  Brain,
  MessageSquare,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SimpleTooltip } from "@/components/ui/tooltip";
import { ProjectSettingsDialog } from "@/components/projects/ProjectSettingsDialog";
import { toast } from "react-hot-toast";
import type { Project } from "@/lib/projects";

interface ProjectCardProps {
  project: Project;
  onProjectUpdated?: (project: Project) => void;
  onProjectDeleted?: (projectId: string) => void;
}

function formatRelativeTime(isoString?: string): string {
  if (!isoString) return "";
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  if (diffHours < 1) return "Just now";
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 30) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function ProjectCard({
  project,
  onProjectUpdated,
  onProjectDeleted,
}: ProjectCardProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isTogglingPin, setIsTogglingPin] = useState(false);

  const handleTogglePin = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isTogglingPin) return;

    setIsTogglingPin(true);
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
      if (onProjectUpdated) {
        onProjectUpdated(data.project);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to update pin state");
    } finally {
      setIsTogglingPin(false);
    }
  };

  const handleCopyLink = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const url = `${origin}/projects/${project.id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Project link copied to clipboard");
    } catch {
      toast.error("Failed to copy link");
    }
  };

  return (
    <>
      <div className="group relative flex flex-col justify-between rounded-lg border border-border bg-card p-4 hover:border-sidebar-foreground/30 hover:shadow-xs transition-all">
        {/* Top bar: Icon, Title, Actions */}
        <div>
          <div className="flex items-start justify-between gap-2">
            <Link
              href={`/projects/${project.id}`}
              className="flex items-center gap-2.5 min-w-0 flex-1 group-hover:text-primary transition-colors"
            >
              <div className="size-8 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Folder className="size-4" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold truncate leading-tight">
                  {project.name}
                </h3>
                <span className="text-[11px] text-muted-foreground font-mono">
                  {formatRelativeTime(project.updated_at)}
                </span>
              </div>
            </Link>

            <div className="flex items-center gap-1 shrink-0">
              {/* Pin button */}
              <SimpleTooltip content={project.is_pinned ? "Unpin project" : "Pin project"}>
                <button
                  type="button"
                  onClick={handleTogglePin}
                  disabled={isTogglingPin}
                  className={`size-7 rounded flex items-center justify-center transition-colors cursor-pointer ${
                    project.is_pinned
                      ? "text-primary hover:bg-primary/10"
                      : "text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground hover:bg-card"
                  }`}
                  aria-label={project.is_pinned ? "Unpin project" : "Pin project"}
                >
                  <Pin
                    className={`size-3.5 ${project.is_pinned ? "fill-primary/20" : ""}`}
                    strokeWidth={2}
                  />
                </button>
              </SimpleTooltip>

              {/* Menu Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    className="size-7 rounded flex items-center justify-center text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground hover:bg-card transition-colors cursor-pointer"
                    aria-label="Project actions"
                  >
                    <MoreHorizontal className="size-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44 text-xs font-sans">
                  <DropdownMenuItem asChild className="cursor-pointer">
                    <Link href={`/projects/${project.id}`}>
                      <MessageSquare className="size-3.5 mr-2 text-muted-foreground" />
                      <span>Open workspace</span>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      setSettingsOpen(true);
                    }}
                    className="cursor-pointer"
                  >
                    <Settings className="size-3.5 mr-2 text-muted-foreground" />
                    <span>Project settings</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleCopyLink} className="cursor-pointer">
                    <Share2 className="size-3.5 mr-2 text-muted-foreground" />
                    <span>Copy project link</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleTogglePin} className="cursor-pointer">
                    {project.is_pinned ? (
                      <>
                        <PinOff className="size-3.5 mr-2 text-muted-foreground" />
                        <span>Unpin project</span>
                      </>
                    ) : (
                      <>
                        <Pin className="size-3.5 mr-2 text-muted-foreground" />
                        <span>Pin to top</span>
                      </>
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      setSettingsOpen(true);
                    }}
                    variant="destructive"
                    className="cursor-pointer text-destructive"
                  >
                    <Trash2 className="size-3.5 mr-2" />
                    <span>Delete project</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Description or Instructions snippet */}
          <Link href={`/projects/${project.id}`} className="block mt-2.5">
            {project.description ? (
              <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                {project.description}
              </p>
            ) : project.custom_instructions ? (
              <p className="text-xs text-muted-foreground/80 italic line-clamp-2 leading-relaxed">
                &ldquo;{project.custom_instructions}&rdquo;
              </p>
            ) : (
              <p className="text-xs text-muted-foreground/60 italic">
                No description provided.
              </p>
            )}
          </Link>
        </div>

        {/* Badges & Stats */}
        <div className="mt-4 pt-3 border-t border-border flex items-center justify-between text-[11px] text-muted-foreground">
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Memory badge */}
            <Badge
              variant="outline"
              className="text-[10px] px-1.5 py-0 font-normal gap-1 text-muted-foreground"
            >
              <Brain className="size-2.5" />
              <span>
                {project.memory_scope === "project"
                  ? "Project Memory"
                  : "Global Memory"}
              </span>
            </Badge>

            {/* Visibility */}
            {project.visibility === "PUBLIC" && (
              <Badge
                variant="secondary"
                className="text-[10px] px-1.5 py-0 font-normal gap-1 bg-primary/10 text-primary border-transparent"
              >
                <Globe className="size-2.5" />
                <span>Public</span>
              </Badge>
            )}
          </div>

          {/* Chat count */}
          <Link
            href={`/projects/${project.id}`}
            className="flex items-center gap-1 text-xs hover:text-foreground transition-colors shrink-0"
          >
            <MessageSquare className="size-3" />
            <span>{(project as any).chats_count ?? 0}</span>
          </Link>
        </div>
      </div>

      <ProjectSettingsDialog
        project={project}
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        onProjectUpdated={onProjectUpdated}
        onProjectDeleted={onProjectDeleted}
      />
    </>
  );
}
