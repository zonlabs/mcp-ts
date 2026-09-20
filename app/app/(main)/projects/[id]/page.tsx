"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
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
import { ProjectSettingsDialog } from "@/components/projects/ProjectSettingsDialog";
import { toast } from "react-hot-toast";
import type { Project, ProjectChat, ProjectFile } from "@/lib/projects";

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
  const projectId = params?.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [chats, setChats] = useState<ProjectChat[]>([]);
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"chats" | "files">("chats");

  // Chat filter
  const [chatSearch, setChatSearch] = useState("");
  // File filter
  const [fileSearch, setFileSearch] = useState("");

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [instructionsExpanded, setInstructionsExpanded] = useState(true);

  // File upload state
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Preview state
  const [previewFile, setPreviewFile] = useState<ProjectFile | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchProjectData = async () => {
    if (!projectId) return;
    setIsLoading(true);
    try {
      const [projRes, filesRes] = await Promise.all([
        fetch(`/api/projects/${projectId}`),
        fetch(`/api/projects/${projectId}/files`),
      ]);

      const projData = await projRes.json();
      if (!projRes.ok) {
        throw new Error(projData.error || "Failed to load project");
      }
      setProject(projData.project);
      setChats(projData.chats || []);

      if (filesRes.ok) {
        const filesData = await filesRes.json();
        setFiles(filesData.files || []);
      }
    } catch (err: any) {
      console.error("[ProjectWorkspacePage] Load failed:", err);
      toast.error(err.message || "Failed to load project");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProjectData();
  }, [projectId]);

  const handleTogglePin = async () => {
    if (!project) return;
    const newPinned = !project.is_pinned;
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_pinned: newPinned }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update pin state");
      setProject(data.project);
      toast.success(newPinned ? "Project pinned" : "Project unpinned");
    } catch (err: any) {
      toast.error(err.message || "Failed to update pin state");
    }
  };

  const handleStartNewChat = () => {
    router.push(`/chat?projectId=${projectId}`);
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
    setIsUploading(true);

    const uploads = Array.from(fileList);
    let successCount = 0;

    for (const file of uploads) {
      const formData = new FormData();
      formData.append("file", file);

      try {
        const res = await fetch(`/api/projects/${projectId}/files`, {
          method: "POST",
          body: formData,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `Failed to upload ${file.name}`);
        setFiles((prev) => [data.file, ...prev]);
        successCount++;
      } catch (err: any) {
        toast.error(err.message || `Failed to upload ${file.name}`);
      }
    }

    if (successCount > 0) {
      toast.success(`Uploaded ${successCount} ${successCount === 1 ? "file" : "files"}`);
    }
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
    return (
      <div className="flex-1 w-full max-w-5xl mx-auto px-4 sm:px-6 py-6 font-sans space-y-6">
        <div className="h-6 w-36 bg-muted rounded animate-pulse" />
        <div className="h-28 rounded-lg border border-border bg-card p-4 animate-pulse space-y-3" />
        <div className="space-y-3 pt-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 rounded-md border border-border bg-card animate-pulse" />
          ))}
        </div>
      </div>
    );
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
    <div className="flex-1 w-full max-w-5xl mx-auto px-4 sm:px-6 py-6 font-sans space-y-6">
      {/* Breadcrumbs & Navigation */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Link
          href="/projects"
          className="hover:text-foreground transition-colors flex items-center gap-1"
        >
          <Folder className="size-3.5" />
          <span>Projects</span>
        </Link>
        <ChevronRight className="size-3 text-muted-foreground/50" />
        <span className="text-foreground font-medium truncate max-w-xs">
          {project.name}
        </span>
      </div>

      {/* Workspace Header Card */}
      <div className="rounded-xl border border-border bg-card p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="size-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5">
              <Folder className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg sm:text-xl font-bold tracking-tight text-foreground">
                  {project.name}
                </h1>
                {project.visibility === "PUBLIC" && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 gap-1 bg-primary/10 text-primary border-transparent">
                    <Globe className="size-2.5" />
                    <span>Public</span>
                  </Badge>
                )}
                {project.is_pinned && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-1 text-primary border-primary/30">
                    <Pin className="size-2.5 fill-primary/20" />
                    <span>Pinned</span>
                  </Badge>
                )}
              </div>
              {project.description && (
                <p className="text-xs text-muted-foreground mt-1 max-w-2xl leading-relaxed">
                  {project.description}
                </p>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 shrink-0">
            <SimpleTooltip content={project.is_pinned ? "Unpin project" : "Pin project"}>
              <Button
                variant="outline"
                size="sm"
                onClick={handleTogglePin}
                className="size-8 p-0 cursor-pointer"
                aria-label={project.is_pinned ? "Unpin project" : "Pin project"}
              >
                {project.is_pinned ? (
                  <Pin className="size-3.5 text-primary fill-primary/20" />
                ) : (
                  <PinOff className="size-3.5 text-muted-foreground" />
                )}
              </Button>
            </SimpleTooltip>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setSettingsOpen(true)}
              className="gap-1.5 text-xs cursor-pointer"
            >
              <Settings className="size-3.5 text-muted-foreground" />
              <span>Settings</span>
            </Button>

            <Button
              size="sm"
              onClick={handleStartNewChat}
              className="gap-1.5 text-xs font-medium cursor-pointer shadow-xs"
            >
              <Plus className="size-3.5" />
              <span>New Chat</span>
            </Button>
          </div>
        </div>

        {/* Configuration Pills Bar */}
        <div className="pt-3 border-t border-border flex items-center justify-between gap-2 flex-wrap text-xs text-muted-foreground">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-sidebar-accent/50 border border-border text-[11px]">
              <Brain className="size-3 text-primary" />
              <span className="font-medium text-foreground">Memory Scope:</span>
              <span>
                {project.memory_scope === "project"
                  ? "Project only"
                  : "Global (User & Project)"}
              </span>
            </div>

            <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-sidebar-accent/50 border border-border text-[11px]">
              <FileText className="size-3 text-primary" />
              <span className="font-medium text-foreground">Knowledge:</span>
              <span>{files.length} {files.length === 1 ? "file" : "files"}</span>
            </div>
          </div>

          <span className="text-[11px] font-mono">
            {chats.length} {chats.length === 1 ? "conversation" : "conversations"}
          </span>
        </div>
      </div>

      {/* Custom Instructions Callout */}
      {project.custom_instructions && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-xs">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5 font-semibold text-primary">
              <Sparkles className="size-3.5" />
              <span>Active Project Instructions</span>
            </div>
            <button
              type="button"
              onClick={() => setInstructionsExpanded(!instructionsExpanded)}
              className="text-[11px] text-primary hover:underline cursor-pointer"
            >
              {instructionsExpanded ? "Hide" : "Show"}
            </button>
          </div>
          {instructionsExpanded && (
            <p className="text-muted-foreground whitespace-pre-wrap leading-relaxed bg-background/60 p-2.5 rounded border border-border/40 font-mono text-[11px]">
              {project.custom_instructions}
            </p>
          )}
        </div>
      )}

      {/* Workspace Tabs: Conversations vs Files & Knowledge */}
      <div className="border-b border-border flex items-center gap-4 text-xs font-medium">
        <button
          type="button"
          onClick={() => setActiveTab("chats")}
          className={`pb-2.5 border-b-2 transition-colors flex items-center gap-2 cursor-pointer ${
            activeTab === "chats"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <MessageSquare className="size-3.5" />
          <span>Conversations</span>
          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-sidebar-accent border border-border font-mono">
            {chats.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("files")}
          className={`pb-2.5 border-b-2 transition-colors flex items-center gap-2 cursor-pointer ${
            activeTab === "files"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <FileText className="size-3.5" />
          <span>Files & Knowledge</span>
          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-sidebar-accent border border-border font-mono">
            {files.length}
          </span>
        </button>
      </div>

      {/* ────────────────────────────────────────────────────────────────────────── */}
      {/* Tab 1: Conversations Section */}
      {/* ────────────────────────────────────────────────────────────────────────── */}
      {activeTab === "chats" && (
        <div className="space-y-4 pt-1">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-foreground">Conversations</h2>
            </div>

            {chats.length > 0 && (
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search chats in project..."
                  value={chatSearch}
                  onChange={(e) => setChatSearch(e.target.value)}
                  className="pl-8 h-8 text-xs bg-card"
                />
              </div>
            )}
          </div>

          {chats.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center p-10 rounded-xl border border-dashed border-border bg-card/30">
              <div className="size-10 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-2.5">
                <MessageSquare className="size-5" />
              </div>
              <h3 className="text-xs font-semibold text-foreground">
                No chats in this project yet
              </h3>
              <p className="text-[11px] text-muted-foreground max-w-sm mt-1 mb-3">
                Start a new chat to begin working with this project&apos;s custom instructions, memory scope, and knowledge files.
              </p>
              <Button
                size="sm"
                onClick={handleStartNewChat}
                className="text-xs gap-1.5"
              >
                <Plus className="size-3.5" />
                <span>Start New Chat</span>
              </Button>
            </div>
          ) : filteredChats.length === 0 ? (
            <div className="text-center p-8 rounded-lg border border-border bg-card text-xs text-muted-foreground">
              No chats matching &ldquo;{chatSearch}&rdquo;
            </div>
          ) : (
            <div className="divide-y divide-border rounded-lg border border-border bg-card overflow-hidden">
              {filteredChats.map((chat) => (
                <div
                  key={chat.id}
                  className="group flex items-center justify-between p-3.5 hover:bg-sidebar-accent/30 transition-colors"
                >
                  <Link
                    href={`/chat/${chat.id}`}
                    className="flex-1 min-w-0 pr-4 block"
                  >
                    <div className="flex items-center gap-2">
                      {chat.is_pinned && (
                        <Pin className="size-3 text-primary fill-primary/20 shrink-0" />
                      )}
                      <span className="text-xs font-medium text-foreground truncate group-hover:text-primary transition-colors">
                        {chat.title || "New Chat"}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground font-mono mt-0.5">
                      <span>{formatRelativeTime(chat.updated_at || chat.created_at)}</span>
                      {chat.visibility === "PUBLIC" && (
                        <span className="text-primary/80">Public link</span>
                      )}
                    </div>
                  </Link>

                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      asChild
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs px-2 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Link href={`/chat/${chat.id}`}>Open</Link>
                    </Button>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className="size-7 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-card transition-colors cursor-pointer"
                          aria-label="Chat options"
                        >
                          <MoreHorizontal className="size-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-40 text-xs font-sans">
                        <DropdownMenuItem asChild className="cursor-pointer">
                          <Link href={`/chat/${chat.id}`}>
                            <MessageSquare className="size-3.5 mr-2 text-muted-foreground" />
                            <span>Open</span>
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            const newTitle = prompt("Rename chat:", chat.title || "New Chat");
                            if (newTitle !== null) {
                              handleRenameChat(chat.id, newTitle);
                            }
                          }}
                          className="cursor-pointer"
                        >
                          <Pencil className="size-3.5 mr-2 text-muted-foreground" />
                          <span>Rename</span>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => handleDeleteChat(chat.id)}
                          variant="destructive"
                          className="cursor-pointer text-destructive"
                        >
                          <Trash2 className="size-3.5 mr-2" />
                          <span>Delete</span>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────────── */}
      {/* Tab 2: Files & Knowledge Section */}
      {/* ────────────────────────────────────────────────────────────────────────── */}
      {activeTab === "files" && (
        <div className="space-y-4 pt-1">
          {/* Top toolbar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Project Files</h2>
              <p className="text-[11px] text-muted-foreground">
                Knowledge files available to the agent via <code className="font-mono bg-muted px-1 rounded">read_project_file</code>.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => handleUploadFiles(e.target.files)}
              />
              <Button
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="gap-1.5 text-xs font-medium cursor-pointer"
              >
                {isUploading ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <UploadCloud className="size-3.5" />
                )}
                <span>{isUploading ? "Uploading..." : "Upload Files"}</span>
              </Button>
            </div>
          </div>

          {/* Drag and Drop Zone if empty or small */}
          {files.length === 0 ? (
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                handleUploadFiles(e.dataTransfer.files);
              }}
              className="flex flex-col items-center justify-center text-center p-10 rounded-xl border border-dashed border-border bg-card/30 hover:border-primary/50 transition-colors"
            >
              <div className="size-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-3">
                <UploadCloud className="size-6" />
              </div>
              <h3 className="text-xs font-semibold text-foreground">
                No files uploaded yet
              </h3>
              <p className="text-[11px] text-muted-foreground max-w-sm mt-1 mb-4 leading-relaxed">
                Upload Markdown, code, text, CSV, JSON, or documentation files (up to 10MB). The agent can inspect and quote them in conversations.
              </p>
              <Button
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="text-xs gap-1.5 cursor-pointer"
              >
                <Plus className="size-3.5" />
                <span>Select Files to Upload</span>
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {/* File Search input */}
              {files.length > 5 && (
                <div className="relative max-w-xs">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder="Search files..."
                    value={fileSearch}
                    onChange={(e) => setFileSearch(e.target.value)}
                    className="pl-8 h-8 text-xs bg-card"
                  />
                </div>
              )}

              {/* Files Table / List */}
              <div className="divide-y divide-border rounded-lg border border-border bg-card overflow-hidden">
                {filteredFiles.map((file) => (
                  <div
                    key={file.id}
                    className="group flex items-center justify-between p-3 hover:bg-sidebar-accent/30 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="size-8 rounded-md bg-muted/60 flex items-center justify-center shrink-0">
                        {getFileIcon(file.name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-foreground truncate">
                            {file.name}
                          </span>
                          {file.content && (
                            <Badge
                              variant="secondary"
                              className="text-[9px] px-1 py-0 font-mono bg-primary/10 text-primary border-transparent"
                            >
                              Text Indexed
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-[10px] text-muted-foreground font-mono mt-0.5">
                          <span>{formatBytes(file.size_bytes)}</span>
                          <span>•</span>
                          <span>{formatRelativeTime(file.created_at)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      {file.content && (
                        <SimpleTooltip content="Preview content">
                          <button
                            type="button"
                            onClick={() => setPreviewFile(file)}
                            className="size-7 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                            aria-label="Preview file content"
                          >
                            <Eye className="size-3.5" />
                          </button>
                        </SimpleTooltip>
                      )}

                      <SimpleTooltip content="Download file">
                        <button
                          type="button"
                          onClick={() => handleDownloadFile(file)}
                          className="size-7 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                          aria-label="Download file"
                        >
                          <Download className="size-3.5" />
                        </button>
                      </SimpleTooltip>

                      <SimpleTooltip content="Delete file">
                        <button
                          type="button"
                          onClick={() => handleDeleteFile(file.id)}
                          className="size-7 rounded flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                          aria-label="Delete file"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </SimpleTooltip>
                    </div>
                  </div>
                ))}
              </div>
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

      {/* Settings Dialog */}
      <ProjectSettingsDialog
        project={project}
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        onProjectUpdated={(p) => setProject(p)}
        onProjectDeleted={() => router.push("/projects")}
      />
    </div>
  );
}
