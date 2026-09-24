"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { PlaygroundChat } from "@/components/chat/PlaygroundChat";
import {
  Folder,
  Settings,
  Plus,
  Pin,
  PinOff,
  Sparkles,
  Brain,
  Globe,
  Lock,
  MessageSquare,
  Search,
  ChevronRight,
  MoreHorizontal,
  Trash2,
  Pencil,
  ArrowLeft,
  FileText,
  UploadCloud,
  Download,
  Eye,
  FileCode,
  FileSpreadsheet,
  File,
  Copy,
  Check,
  X,
  Loader2,
  Share2,
  Users,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { SimpleTooltip } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ProjectSettingsTab } from "@/components/projects/ProjectSettingsTab";
import { ProjectWorkspaceSkeleton } from "@/components/projects/ProjectWorkspaceSkeleton";
import { ShareDialog } from "@/components/chat/ShareDialog";
import { useSidebarProjects, useUpdateProject, useDeleteProject, useProject, useProjectFiles } from "@/lib/hooks/use-sidebar-projects";
import { useQueryClient } from "@tanstack/react-query";
import { ChatInput } from "@/components/chat/ChatInput";
import { toast } from "react-hot-toast";
import type { Project, ProjectChat, ProjectFile } from "@/lib/projects";

function formatChatDate(isoString?: string): string {
  if (!isoString) return "";
  const date = new Date(isoString);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
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

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}

function getFileIcon(filename: string) {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  if (['ts', 'tsx', 'js', 'jsx', 'py', 'sql', 'html', 'css', 'json'].includes(ext)) {
    return <FileCode className="size-4 text-purple-400" />;
  }
  if (['csv', 'tsv', 'xlsx', 'xls'].includes(ext)) {
    return <FileSpreadsheet className="size-4 text-emerald-400" />;
  }
  if (['md', 'txt', 'doc', 'docx', 'pdf'].includes(ext)) {
    return <FileText className="size-4 text-blue-400" />;
  }
  return <File className="size-4 text-muted-foreground" />;
}

export default function ProjectWorkspacePage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = params?.id as string;
  const queryClient = useQueryClient();
  const { upsertProject } = useSidebarProjects({ enabled: false });

  // Use the shared TanStack Query hooks so AppShell, page.tsx, and PlaygroundChat share 1 deduplicated request
  const {
    project: projectData,
    chats: projectChats,
    isLoading: isProjectLoading,
  } = useProject(projectId);

  const {
    files: projectFiles,
    isLoading: isFilesLoading,
    refetch: refetchFiles,
  } = useProjectFiles(projectId);

  const [localProject, setLocalProject] = useState<Project | null>(null);
  const [localChats, setLocalChats] = useState<ProjectChat[] | null>(null);
  const [localFiles, setLocalFiles] = useState<ProjectFile[] | null>(null);

  const project = localProject || projectData;
  const chats = localChats !== null ? localChats : projectChats;
  const files = localFiles !== null ? localFiles : projectFiles;
  const isLoading = (isProjectLoading || isFilesLoading) && !project;

  const [shareOpen, setShareOpen] = useState(false);
  const tabParam = searchParams?.get("tab");
  const [activeTab, setActiveTab] = useState<"chats" | "files" | "settings">(
    tabParam === "settings" || tabParam === "files" ? tabParam : "chats"
  );
  useEffect(() => {
    if (tabParam === "settings" || tabParam === "files" || tabParam === "chats") {
      setActiveTab(tabParam);
    }
  }, [tabParam]);

  const [chatSearch, setChatSearch] = useState("");
  const [fileSearch, setFileSearch] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [instructionsExpanded, setInstructionsExpanded] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingFiles, setUploadingFiles] = useState<{
    tempId: string;
    name: string;
    size: number;
    status: "uploading" | "error";
    errorMessage?: string;
  }[]>([]);
  const [previewFile, setPreviewFile] = useState<ProjectFile | null>(null);
  const [copied, setCopied] = useState(false);

  const setProject = (updater: React.SetStateAction<Project | null>) => {
    setLocalProject(updater);
    queryClient.setQueryData(["project", projectId], (old: any) => {
      const nextProj = typeof updater === "function" ? (updater as any)(old?.project ?? null) : updater;
      return old ? { ...old, project: nextProj } : { project: nextProj, chats: [] };
    });
  };

  const setChats = (updater: React.SetStateAction<ProjectChat[]>) => {
    setLocalChats((prev) => {
      const base = prev !== null ? prev : projectChats;
      return typeof updater === "function" ? (updater as any)(base) : updater;
    });
    queryClient.setQueryData(["project", projectId], (old: any) => {
      const nextChats = typeof updater === "function" ? (updater as any)(old?.chats ?? []) : updater;
      return old ? { ...old, chats: nextChats } : { project: null, chats: nextChats };
    });
  };

  const setFiles = (updater: React.SetStateAction<ProjectFile[]>) => {
    setLocalFiles((prev) => {
      const base = prev !== null ? prev : projectFiles;
      return typeof updater === "function" ? (updater as any)(base) : updater;
    });
    queryClient.setQueryData(["project-files", projectId], (old: any) => {
      const nextFiles = typeof updater === "function" ? (updater as any)(old?.files ?? []) : updater;
      return { files: nextFiles };
    });
  };

  const updateProject = useUpdateProject();
  const deleteProject = useDeleteProject();

  const handleTogglePin = async () => {
    if (!project) return;
    const nextPinned = !project.is_pinned;
    setProject((prev) => (prev ? { ...prev, is_pinned: nextPinned } : null));
    try {
      await updateProject.mutateAsync({ id: project.id, is_pinned: nextPinned });
      toast.success(nextPinned ? "Project pinned" : "Project unpinned");
    } catch {
      setProject((prev) => (prev ? { ...prev, is_pinned: !nextPinned } : null));
    }
  };

  const handleStartNewChat = () => {
    router.push(`/projects/${projectId}`);
  };

  const handleShareProject = () => {
    setShareOpen(true);
  };

  const handleDeleteProject = async () => {
    if (!project || deleteProject.isPending) return;
    if (!confirm(`Are you sure you want to delete "${project.name}"? This action cannot be undone.`)) return;
    try {
      await deleteProject.mutateAsync(project.id);
      router.push("/projects");
    } catch {
      // Handled by mutation toast
    }
  };

  const handleDeleteChat = async (chatId: string) => {
    try {
      const res = await fetch(`/api/chats?id=${encodeURIComponent(chatId)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete chat");
      setChats((prev) => prev.filter((c) => c.id !== chatId));
      toast.success("Chat deleted");
    } catch (err: any) {
      toast.error(err.message || "Failed to delete chat");
    }
  };

  const handleRenameChat = async (chatId: string, newTitle: string) => {
    const trimmed = newTitle.trim();
    if (!trimmed) return;
    try {
      const res = await fetch(`/api/chats?id=${encodeURIComponent(chatId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: trimmed }),
      });
      if (!res.ok) throw new Error("Failed to rename chat");
      setChats((prev) =>
        prev.map((c) => (c.id === chatId ? { ...c, title: trimmed } : c))
      );
      toast.success("Chat renamed");
    } catch (err: any) {
      toast.error(err.message || "Failed to rename chat");
    }
  };

  // Upload handler
  const handleUploadFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setActiveTab("files");
    setIsUploading(true);

    const uploads = Array.from(fileList);
    const newItems = uploads.map((file) => ({
      tempId: crypto.randomUUID(),
      name: file.name,
      size: file.size,
      status: "uploading" as const,
    }));

    setUploadingFiles((prev) => [...newItems, ...prev]);

    for (let i = 0; i < uploads.length; i++) {
      const file = uploads[i];
      const tempId = newItems[i].tempId;
      const formData = new FormData();
      formData.append("file", file);

      try {
        const res = await fetch(`/api/projects/${projectId}/files`, {
          method: "POST",
          body: formData,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `Failed to upload ${file.name}`);

        if (data.file) {
          setFiles((prev) => [data.file, ...prev.filter((f) => f.id !== data.file.id)]);
        }
        setUploadingFiles((prev) => prev.filter((item) => item.tempId !== tempId));
        toast.success(`Uploaded ${file.name}`);
      } catch (err: any) {
        setUploadingFiles((prev) =>
          prev.map((item) =>
            item.tempId === tempId
              ? { ...item, status: "error", errorMessage: err.message || "Upload failed" }
              : item
          )
        );
        toast.error(err.message || `Failed to upload ${file.name}`);
      }
    }

    await refetchFiles();

    setIsUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDeleteFile = async (fileId: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/files/${fileId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete file");
      setFiles((prev) => prev.filter((f) => f.id !== fileId));
      if (previewFile?.id === fileId) setPreviewFile(null);
      toast.success("File deleted");
    } catch (err: any) {
      toast.error(err.message || "Failed to delete file");
    }
  };

  const handleDownloadFile = async (file: ProjectFile) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/files/${file.id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to get download URL");
      if (data.download_url) {
        window.open(data.download_url, "_blank");
      }
    } catch (err: any) {
      toast.error(err.message || "Download failed");
    }
  };

  const handleCopyContent = () => {
    if (!previewFile?.content) return;
    navigator.clipboard.writeText(previewFile.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success("Copied to clipboard");
  };

  const filteredChats = useMemo(() => {
    if (!chatSearch.trim()) return chats;
    const q = chatSearch.toLowerCase().trim();
    return chats.filter((c) => (c.title || "New Chat").toLowerCase().includes(q));
  }, [chats, chatSearch]);

  const filteredFiles = useMemo(() => {
    if (!fileSearch.trim()) return files;
    const q = fileSearch.toLowerCase().trim();
    return files.filter((f) => f.name.toLowerCase().includes(q));
  }, [files, fileSearch]);



  if (isLoading) {
    return <ProjectWorkspaceSkeleton />;
  }

  if (!project) {
    return (
      <div className="flex-1 w-full max-w-5xl mx-auto px-4 sm:px-6 py-12 font-sans text-center">
        <h2 className="text-base font-semibold">Project not found</h2>
        <p className="text-xs text-muted-foreground mt-1 mb-4">
          The project may have been deleted or you don&apos;t have access to it.
        </p>
        <Button asChild size="sm" variant="outline" className="text-xs">
          <Link href="/projects">
            <ArrowLeft className="size-3.5 mr-1" />
            Back to Projects
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <PlaygroundChat
      key={projectId}
      projectId={projectId}
      renderEmptyState={({ sendChatInput, status }) => (
        <div className="flex-1 h-full min-h-0 overflow-y-auto">
          <div className="w-full max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-10 font-sans space-y-6 pb-24">
        {/* Top Header Row: 📁 [name] ... [Share] [•••] */}
        <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <Folder className="size-6 text-foreground stroke-[2] shrink-0" />
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground truncate">
            {project.name}
          </h1>
          {project.role && project.role !== "owner" ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground font-normal shrink-0">
              <Users className="size-3.5" />
              <span>{project.role === "editor" ? "Can Edit" : "View Only"}</span>
            </span>
          ) : project.shares_count && project.shares_count > 0 ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground font-normal shrink-0">
              <Users className="size-3.5" />
              <span>Shared ({project.shares_count})</span>
            </span>
          ) : null}
          {project.visibility === "PUBLIC" && (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground font-normal shrink-0">
              <Globe className="size-3.5" />
              <span>Public</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleShareProject}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm bg-secondary/60 hover:bg-secondary border border-border/50 text-xs font-medium text-foreground transition-colors cursor-pointer"
          >
            <Share2 className="size-3.5 text-muted-foreground" />
            <span>Share</span>
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="size-8 rounded-sm flex items-center justify-center bg-secondary/60 hover:bg-secondary border border-border/50 text-foreground transition-colors cursor-pointer"
                aria-label="Project actions"
              >
                <MoreHorizontal className="size-4 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44 text-xs font-sans">
              <DropdownMenuItem onClick={() => setActiveTab("settings")} className="cursor-pointer">
                <Settings className="size-3.5 mr-2 text-muted-foreground" />
                <span>Project Settings</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleTogglePin} className="cursor-pointer">
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
                onClick={handleDeleteProject}
                className="cursor-pointer text-destructive focus:text-destructive"
              >
                <Trash2 className="size-3.5 mr-2" />
                <span>Delete Project</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Input Bar */}
      <div className="w-full">
        <ChatInput
          placeholder={`New chat in ${project.name}`}
          input={chatInput}
          onInputChange={setChatInput}
          onSend={sendChatInput}
          status={status}
        />
      </div>

      {/* Pill Tabs: Chats | Sources | Settings (at bottom of chat input) */}
      <div className="flex items-center gap-2 pt-1 border-b border-border/40 pb-3">
        <button
          type="button"
          onClick={() => setActiveTab("chats")}
          className={`px-3.5 py-1.5 text-xs font-medium rounded-sm transition-colors cursor-pointer ${
            activeTab === "chats"
              ? "bg-muted text-foreground border border-border shadow-xs font-semibold"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
          }`}
        >
          Chats
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("files")}
          className={`px-3.5 py-1.5 text-xs font-medium rounded-sm transition-colors cursor-pointer ${
            activeTab === "files"
              ? "bg-muted text-foreground border border-border shadow-xs font-semibold"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
          }`}
        >
          Sources ({files.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("settings")}
          className={`px-3.5 py-1.5 text-xs font-medium rounded-sm transition-colors cursor-pointer flex items-center gap-1.5 ${
            activeTab === "settings"
              ? "bg-muted text-foreground border border-border shadow-xs font-semibold"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
          }`}
        >
          <Settings className="size-3.5" />
          <span>Settings</span>
        </button>
      </div>

      {/* Tab 1: Chats List */}
      {activeTab === "chats" && (
        <div className="space-y-3 pt-1">
          {chats.length === 0 ? (
            <div className="text-center py-12 text-xs text-muted-foreground/60">
              No chats in this project yet
            </div>
          ) : (
            <div className="space-y-0.5">
              {filteredChats.map((chat) => (
                <Link
                  key={chat.id}
                  href={`/projects/${projectId}/chat/${chat.id}`}
                  className="group block py-3 px-3 -mx-3 rounded-sm hover:bg-secondary/30 transition-colors"
                >
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-[14px] font-semibold text-foreground group-hover:text-primary transition-colors truncate">
                      {chat.title || "New Chat"}
                    </span>
                    <span className="text-xs text-muted-foreground/60 font-mono shrink-0">
                      {formatChatDate(chat.updated_at || chat.created_at)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground/80 line-clamp-1 mt-0.5 font-normal">
                    {formatRelativeTime(chat.updated_at || chat.created_at)}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Sources / Files List */}
      {activeTab === "files" && (
        <div className="space-y-4 pt-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              {files.length + uploadingFiles.filter((u) => u.status === "uploading").length}{" "}
              {files.length + uploadingFiles.filter((u) => u.status === "uploading").length === 1
                ? "knowledge file"
                : "knowledge files"}
            </span>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => handleUploadFiles(e.target.files)}
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="h-7 text-xs gap-1.5 rounded-md cursor-pointer"
            >
              <UploadCloud className="size-3" />
              <span>Upload File</span>
            </Button>
          </div>

          {files.length === 0 && uploadingFiles.length === 0 ? (
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                handleUploadFiles(e.dataTransfer.files);
              }}
              className="flex flex-col items-center justify-center text-center p-8 rounded-lg border border-dashed border-border/60 bg-card/20 hover:border-primary/40 transition-colors"
            >
              <UploadCloud className="size-8 text-muted-foreground/50 mb-2" />
              <p className="text-xs font-medium text-foreground">No source files uploaded yet</p>
              <p className="text-[11px] text-muted-foreground mt-1 mb-3">
                Upload knowledge files (.md, .txt, .pdf, code) for the model to reference.
              </p>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="text-xs rounded-md cursor-pointer"
              >
                Select Files
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-border/40 rounded-lg border border-border/40 bg-card/40 overflow-hidden">
              {/* Currently uploading files */}
              {uploadingFiles.map((item) => (
                <div
                  key={item.tempId}
                  className={`flex items-center justify-between p-3 transition-colors ${
                    item.status === "error"
                      ? "bg-destructive/10 border-l-2 border-destructive"
                      : "bg-secondary/40 animate-pulse"
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    {getFileIcon(item.name)}
                    <span className="text-xs font-medium text-foreground truncate">
                      {item.name}
                    </span>
                    <span className="text-[10px] text-muted-foreground font-mono shrink-0">
                      {formatBytes(item.size)}
                    </span>
                    {item.status === "uploading" ? (
                      <span className="inline-flex items-center gap-1.5 text-[11px] text-primary font-medium shrink-0 ml-1">
                        <Loader2 className="size-3 animate-spin text-primary" />
                        <span>Uploading...</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] text-destructive font-medium shrink-0 ml-1">
                        <AlertCircle className="size-3" />
                        <span>{item.errorMessage || "Failed"}</span>
                      </span>
                    )}
                  </div>

                  {item.status === "error" && (
                    <button
                      type="button"
                      onClick={() =>
                        setUploadingFiles((prev) => prev.filter((u) => u.tempId !== item.tempId))
                      }
                      className="text-xs text-muted-foreground hover:text-foreground p-1 cursor-pointer"
                      title="Dismiss"
                    >
                      <X className="size-3.5" />
                    </button>
                  )}
                </div>
              ))}

              {/* Uploaded files */}
              {files.map((file) => (
                <div
                  key={file.id}
                  className="group flex items-center justify-between p-3 hover:bg-secondary/30 transition-colors"
                >
                  <div
                    className="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer"
                    onClick={() => setPreviewFile(file)}
                  >
                    {getFileIcon(file.name)}
                    <span className="text-xs font-medium text-foreground truncate group-hover:text-primary transition-colors">
                      {file.name}
                    </span>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {formatBytes(file.size_bytes)}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={() => handleDownloadFile(file)}
                      className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                      title="Download"
                    >
                      <Download className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteFile(file.id)}
                      className="p-1 rounded text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
                      title="Delete"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* File Preview Modal */}
      {previewFile && (
        <Dialog open={Boolean(previewFile)} onOpenChange={(open) => !open && setPreviewFile(null)}>
          <DialogContent className="sm:max-w-[650px] max-h-[85vh] flex flex-col font-sans">
            <DialogHeader className="flex flex-row items-center justify-between pr-6 border-b border-border pb-3">
              <div className="flex items-center gap-2 min-w-0">
                {getFileIcon(previewFile.name)}
                <div>
                  <DialogTitle className="text-sm font-semibold truncate">
                    {previewFile.name}
                  </DialogTitle>
                  <DialogDescription className="text-[11px] text-muted-foreground font-mono mt-0.5">
                    {formatBytes(previewFile.size_bytes)} • {previewFile.mime_type}
                  </DialogDescription>
                </div>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyContent}
                className="gap-1.5 text-xs h-7.5 cursor-pointer shrink-0"
              >
                {copied ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
                <span>{copied ? "Copied" : "Copy"}</span>
              </Button>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto max-h-[55vh] p-3 rounded-md bg-muted/40 border border-border/70 font-mono text-[11px] leading-relaxed whitespace-pre-wrap select-text">
              {previewFile.content || "No text content preview available."}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Tab 3: Settings */}
      {activeTab === "settings" && (
        <div className="pt-2">
          <ProjectSettingsTab
            project={project}
            onProjectUpdated={(updatedProject) => setProject(updatedProject)}
            onProjectDeleted={() => router.push("/projects")}
          />
        </div>
      )}

      {/* Share Project Dialog */}
      <ShareDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        type="project"
        id={projectId}
        title="Share Project"
        initialVisibility={(project?.visibility as any) || "PRIVATE"}
        onVisibilityChange={(v) => {
          setProject((prev) => (prev ? { ...prev, visibility: v, is_shared: v === "PUBLIC" || (prev.shares_count || 0) > 0 } : null));
          upsertProject({ id: projectId, visibility: v, is_shared: v === "PUBLIC" || (project?.shares_count || 0) > 0 });
        }}
        onSharesChange={(updatedShares) => {
          setProject((prev) => (prev ? { ...prev, shares_count: updatedShares.length, is_shared: prev.visibility === "PUBLIC" || updatedShares.length > 0 } : null));
          upsertProject({ id: projectId, shares_count: updatedShares.length, is_shared: project?.visibility === "PUBLIC" || updatedShares.length > 0 });
        }}
      />
      </div>
    </div>
      )}
    />
  );
}
