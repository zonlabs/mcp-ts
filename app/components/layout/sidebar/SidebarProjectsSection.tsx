"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Folder,
  SquarePen,
  FolderPen,
  ChevronDown,
  ChevronRight,
  Pin,
  Users,
  Share2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SimpleTooltip } from "@/components/ui/tooltip";
import type { Project } from "@/lib/projects";
import type { SidebarChat } from "@/lib/sidebar-chats";
import { ChatItem } from "./ChatItem";
import { ProjectContextMenu } from "./context-menus/ProjectContextMenu";

export interface SidebarProjectsSectionProps {
  isExpanded: boolean;
  isMobile?: boolean;
  projects: Project[];
  allChats: SidebarChat[];
  currentChatId: string | null;
  currentNav: string;
  expandedProjectIds: Set<string>;
  onToggleProjectExpanded: (projectId: string, e?: React.MouseEvent) => void;
  onOpenCreateProject: () => void;
  onShareProject: (project: Project) => void;
  onDeleteChat: (id: string) => void;
  onTogglePinChat: (id: string, pinned: boolean) => void;
  onRenameChat: (id: string, title: string) => void;
  onShareChat: (chat: SidebarChat) => void;
  onItemClick?: () => void;
}

export function SidebarProjectsSection({
  isExpanded,
  isMobile = false,
  projects,
  allChats,
  currentChatId,
  currentNav,
  expandedProjectIds,
  onToggleProjectExpanded,
  onOpenCreateProject,
  onShareProject,
  onDeleteChat,
  onTogglePinChat,
  onRenameChat,
  onShareChat,
  onItemClick,
}: SidebarProjectsSectionProps) {
  const pathname = usePathname();
  const [projectsOpen, setProjectsOpen] = useState(true);

  if (!isExpanded) {
    return (
      <SimpleTooltip content="Projects" side="right">
        <Link
          href="/projects"
          onClick={onItemClick}
          className={cn(
            "w-full flex items-center justify-center h-8 px-0 rounded-sm text-[13px] font-medium transition-colors text-left overflow-hidden",
            currentNav === "projects"
              ? "bg-sidebar-accent text-sidebar-foreground font-semibold shadow-2xs"
              : "text-sidebar-foreground/75 hover:text-sidebar-foreground hover:bg-sidebar-accent/60"
          )}
        >
          <Folder className="size-4 shrink-0" />
        </Link>
      </SimpleTooltip>
    );
  }

  return (
    <div className="pt-2">
      <div className="w-full flex items-center justify-between px-2 py-1 group/projects-header">
        <button
          type="button"
          onClick={() => setProjectsOpen((o) => !o)}
          className="flex items-center gap-1.5 text-xs font-semibold text-sidebar-foreground/80 hover:text-sidebar-foreground transition-colors cursor-pointer"
        >
          <span className="text-[13px]">Projects</span>
          <span className="transition-opacity opacity-0 group-hover/projects-header:opacity-100">
            {projectsOpen ? (
              <ChevronDown className="size-3.5 text-muted-foreground" />
            ) : (
              <ChevronRight className="size-3.5 text-muted-foreground" />
            )}
          </span>
        </button>
        <div className="flex items-center gap-0.5 opacity-0 group-hover/projects-header:opacity-100 transition-opacity">
          <SimpleTooltip content="Add project" side="top">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenCreateProject();
              }}
              className="p-1 rounded-sm text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors cursor-pointer flex items-center justify-center"
              aria-label="Add project"
            >
              <FolderPen className="size-3.5" />
            </button>
          </SimpleTooltip>
          <SimpleTooltip content="All projects" side="top">
            <Link
              href="/projects"
              onClick={(e) => {
                e.stopPropagation();
                onItemClick?.();
              }}
              className="p-1 rounded-sm text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors cursor-pointer flex items-center justify-center"
              aria-label="All projects"
            >
              <Folder className="size-3.5" />
            </Link>
          </SimpleTooltip>
        </div>
      </div>

      {projectsOpen && (
        <div className="mt-1 space-y-0.5 px-0.5">
          {projects.map((project) => {
            const projectChats = allChats
              .filter((c) => c.project_id === project.id)
              .sort(
                (a, b) =>
                  (Date.parse(b.updated_at || b.created_at || "") || 0) -
                  (Date.parse(a.updated_at || a.created_at || "") || 0)
              );
            const isProjectActive =
              !currentChatId &&
              (pathname === `/projects/${project.id}` || pathname.startsWith(`/projects/${project.id}/`));
            const isProjectExpanded = expandedProjectIds.has(project.id);

            return (
              <div key={project.id} className="space-y-0.5">
                <div
                  className={cn(
                    "group flex items-center justify-between gap-1.5 px-2 py-1.5 rounded-lg text-[13px] transition-colors cursor-pointer",
                    isProjectActive
                      ? "bg-sidebar-accent text-sidebar-foreground font-medium shadow-2xs"
                      : "text-sidebar-foreground/80 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
                  )}
                  onClick={() => onToggleProjectExpanded(project.id)}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <Folder
                      className={cn(
                        "size-4 shrink-0",
                        isProjectActive ? "text-foreground" : "text-muted-foreground"
                      )}
                    />
                    <Link
                      href={`/projects/${project.id}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onItemClick?.();
                      }}
                      className="truncate font-medium text-[13px] hover:underline"
                    >
                      {project.name}
                    </Link>
                    {project.is_pinned && (
                      <Pin className="size-3 shrink-0 text-muted-foreground/80 -rotate-45" />
                    )}
                    {project.role && project.role !== "owner" ? (
                      <SimpleTooltip content={`Shared with you (${project.role})`}>
                        <span
                          className="shrink-0 flex items-center text-foreground/75 hover:text-foreground"
                          aria-label={`Shared with you (${project.role})`}
                        >
                          <Users className="size-3.5 shrink-0 text-primary/70" />
                        </span>
                      </SimpleTooltip>
                    ) : (
                      <>
                        {project.shares_count && project.shares_count > 0 ? (
                          <SimpleTooltip content={`Shared with ${project.shares_count} collaborator${project.shares_count > 1 ? "s" : ""}`}>
                            <span
                              className="shrink-0 flex items-center text-foreground/75 hover:text-foreground"
                              aria-label={`Shared with ${project.shares_count} collaborators`}
                            >
                              <Users className="size-3.5 shrink-0 text-primary/70" />
                            </span>
                          </SimpleTooltip>
                        ) : null}
                        {project.visibility === "PUBLIC" ? (
                          <SimpleTooltip content="Publicly shared project">
                            <span
                              className="shrink-0 flex items-center text-foreground/75 hover:text-foreground"
                              aria-label="Publicly shared project"
                            >
                              <Share2 className="size-3.5 shrink-0 text-primary/70" />
                            </span>
                          </SimpleTooltip>
                        ) : project.is_shared && (!project.shares_count || project.shares_count === 0) ? (
                          <SimpleTooltip content="Shared project">
                            <span
                              className="shrink-0 flex items-center text-foreground/75 hover:text-foreground"
                              aria-label="Shared project"
                            >
                              <Share2 className="size-3.5 shrink-0 text-primary/70" />
                            </span>
                          </SimpleTooltip>
                        ) : null}
                      </>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <SimpleTooltip content="New chat in project">
                      <Link
                        href={`/projects/${project.id}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onItemClick?.();
                        }}
                        className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/80 transition-colors"
                      >
                        <SquarePen className="size-3.5" />
                      </Link>
                    </SimpleTooltip>

                    <ProjectContextMenu
                      project={project}
                      onShareProject={onShareProject}
                    />
                  </div>
                </div>

                {isProjectExpanded && (
                  <div className="space-y-0.5">
                    {projectChats.length > 0 ? (
                      <div className="pl-6 space-y-0.5">
                        {projectChats.map((chat) => (
                          <div key={chat.id} onClick={onItemClick}>
                            <ChatItem
                              chat={chat}
                              isActive={currentChatId === chat.id}
                              onDelete={onDeleteChat}
                              onTogglePin={onTogglePinChat}
                              onRename={onRenameChat}
                              onShare={onShareChat}
                            />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="pl-6 py-1 text-xs text-muted-foreground/60 select-none">
                        No project chats
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
