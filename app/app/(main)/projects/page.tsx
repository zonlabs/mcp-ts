"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Folder, Plus, Search, Pin, Sparkles, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProjectCard } from "@/components/projects/ProjectCard";
import { CreateProjectDialog } from "@/components/projects/CreateProjectDialog";
import { useAuth } from "@/components/providers/AuthProvider";
import type { Project } from "@/lib/projects";
import { toast } from "react-hot-toast";

export default function ProjectsPage() {
  const { userSession } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"all" | "mine" | "shared">("all");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

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

  const handleProjectUpdated = (updatedProject: Project) => {
    setProjects((prev) =>
      prev.map((p) => (p.id === updatedProject.id ? updatedProject : p))
    );
  };

  const handleProjectDeleted = (deletedId: string) => {
    setProjects((prev) => prev.filter((p) => p.id !== deletedId));
  };

  const currentUserId = userSession?.user?.id;

  const filteredProjects = useMemo(() => {
    let list = [...projects];

    // Tab filter
    if (activeTab === "mine" && currentUserId) {
      list = list.filter((p) => p.user_id === currentUserId);
    } else if (activeTab === "shared" && currentUserId) {
      list = list.filter((p) => p.user_id !== currentUserId || p.visibility === "PUBLIC");
    }

    // Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.description && p.description.toLowerCase().includes(q)) ||
          (p.custom_instructions && p.custom_instructions.toLowerCase().includes(q))
      );
    }

    return list;
  }, [projects, activeTab, searchQuery, currentUserId]);

  const pinnedProjects = useMemo(
    () => filteredProjects.filter((p) => p.is_pinned),
    [filteredProjects]
  );

  const otherProjects = useMemo(
    () => filteredProjects.filter((p) => !p.is_pinned),
    [filteredProjects]
  );

  return (
    <div className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-6 font-sans">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-border">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="size-8 rounded-md bg-primary/10 text-primary flex items-center justify-center">
              <Folder className="size-4.5" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              Projects
            </h1>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Dedicated workspaces with custom instructions and memory scoping.
          </p>
        </div>

        <Button
          size="sm"
          onClick={() => setCreateDialogOpen(true)}
          className="gap-1.5 text-xs font-medium cursor-pointer shadow-xs"
        >
          <Plus className="size-3.5" />
          <span>New Project</span>
        </Button>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-6 pb-4">
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search projects..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-8 text-xs bg-card"
          />
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-1 p-0.5 bg-sidebar-accent/50 border border-border rounded-md text-xs">
          <button
            type="button"
            onClick={() => setActiveTab("all")}
            className={`px-2.5 py-1 rounded text-xs transition-colors cursor-pointer ${
              activeTab === "all"
                ? "bg-card text-foreground font-medium shadow-2xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("mine")}
            className={`px-2.5 py-1 rounded text-xs transition-colors cursor-pointer ${
              activeTab === "mine"
                ? "bg-card text-foreground font-medium shadow-2xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Created by you
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("shared")}
            className={`px-2.5 py-1 rounded text-xs transition-colors cursor-pointer ${
              activeTab === "shared"
                ? "bg-card text-foreground font-medium shadow-2xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Shared
          </button>
        </div>
      </div>

      {/* Content Area */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-36 rounded-lg border border-border bg-card p-4 animate-pulse space-y-3"
            >
              <div className="flex items-center gap-2.5">
                <div className="size-8 rounded-md bg-muted" />
                <div className="h-4 w-32 bg-muted rounded" />
              </div>
              <div className="h-3 w-48 bg-muted rounded" />
              <div className="h-3 w-20 bg-muted rounded pt-4" />
            </div>
          ))}
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center p-12 mt-4 rounded-xl border border-dashed border-border bg-card/40">
          <div className="size-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-3">
            <Folder className="size-6" />
          </div>
          <h3 className="text-sm font-semibold text-foreground">
            {searchQuery ? "No matching projects found" : "No projects yet"}
          </h3>
          <p className="text-xs text-muted-foreground max-w-sm mt-1 mb-4">
            {searchQuery
              ? `We couldn't find any projects matching "${searchQuery}".`
              : "Create a project to give LinkOS persistent instructions, customized memory, and organized conversations."}
          </p>
          {!searchQuery && (
            <Button
              size="sm"
              onClick={() => setCreateDialogOpen(true)}
              className="text-xs gap-1.5"
            >
              <Plus className="size-3.5" />
              <span>Create Project</span>
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-6 pt-2">
          {/* Pinned Projects */}
          {pinnedProjects.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                <Pin className="size-3 text-primary fill-primary/20" />
                <span>Pinned Projects</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {pinnedProjects.map((project) => (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    onProjectUpdated={handleProjectUpdated}
                    onProjectDeleted={handleProjectDeleted}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Other Projects */}
          {otherProjects.length > 0 && (
            <div className="space-y-3">
              {pinnedProjects.length > 0 && (
                <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider pt-2">
                  <Folder className="size-3" />
                  <span>Other Projects</span>
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {otherProjects.map((project) => (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    onProjectUpdated={handleProjectUpdated}
                    onProjectDeleted={handleProjectDeleted}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Create Project Modal */}
      <CreateProjectDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onProjectCreated={handleProjectCreated}
      />
    </div>
  );
}
