"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Download,
  Trash2,
  Share2,
  ExternalLink,
  Copy,
  Check,
  ShieldAlert,
  Loader2,
  Lock,
  Globe,
  FileJson,
  HardDrive,
} from "lucide-react";
import toast from "react-hot-toast";

import { Button } from "@/components/ui/button";
import { SimpleTooltip } from "@/components/ui/tooltip";
import { useSidebarChats } from "@/lib/hooks/use-chats";
import { useSidebarProjects } from "@/lib/hooks/use-projects";
import { DeleteAllChatsDialog } from "@/components/settings/DeleteAllChatsDialog";
import { DeleteMcpUsageEventsDialog } from "@/components/settings/DeleteMcpUsageEventsDialog";
import { DeleteAllProjectsDialog } from "@/components/settings/DeleteAllProjectsDialog";
import { DeleteAllFilesDialog } from "@/components/settings/DeleteAllFilesDialog";
import type { SidebarChat } from "@/lib/sidebar-chats";
import {
  useStorageUsage,
  useExportChatsMutation,
  useUpdateChatVisibilityMutation,
  useRevokeAllSharedMutation,
  useDeleteAllChatsMutation,
  useDeleteMcpUsageEventsMutation,
  useDeleteAllProjectsMutation,
  useDeleteAllFilesMutation,
} from "@/lib/hooks/use-data-controls";

const FREE_TIER_LIMIT_BYTES = 500 * 1024 * 1024; // 500 MB (Supabase free tier)

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(2)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return Number.isInteger(mb) ? `${mb} MB` : `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return Number.isInteger(gb) ? `${gb} GB` : `${gb.toFixed(2)} GB`;
}

export default function DataControlsPage() {
  const { chats } = useSidebarChats();
  const { projects } = useSidebarProjects();

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteUsageEventsDialogOpen, setDeleteUsageEventsDialogOpen] = useState(false);
  const [deleteProjectsDialogOpen, setDeleteProjectsDialogOpen] = useState(false);
  const [deleteFilesDialogOpen, setDeleteFilesDialogOpen] = useState(false);
  const [copiedChatId, setCopiedChatId] = useState<string | null>(null);

  // Centralized TanStack Query hooks & mutations
  const { data: storage } = useStorageUsage();
  const exportMutation = useExportChatsMutation();
  const updateVisibilityMutation = useUpdateChatVisibilityMutation();
  const revokeAllMutation = useRevokeAllSharedMutation((chats || []).map((c) => c.id));
  const deleteAllChatsMutation = useDeleteAllChatsMutation();
  const deleteMcpUsageMutation = useDeleteMcpUsageEventsMutation();
  const deleteAllProjectsMutation = useDeleteAllProjectsMutation();
  const deleteAllFilesMutation = useDeleteAllFilesMutation();

  const usedBytes = storage?.used_bytes ?? 0;
  const limitBytes = storage?.limit_bytes ?? FREE_TIER_LIMIT_BYTES;
  const percentageUsed =
    usedBytes > 0 ? Math.min(100, Math.max(0.5, (usedBytes / limitBytes) * 100)) : 0;

  // Filter public shared chats
  const sharedChats = (chats || []).filter((chat) => chat.visibility === "PUBLIC");

  // Format date helper
  const formatDate = (iso?: string | null) => {
    if (!iso) return "Unknown";
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  // Copy share link helper
  const handleCopyLink = async (chatId: string) => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const shareUrl = `${origin}/share/${chatId}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedChatId(chatId);
      toast.success("Shared link copied to clipboard");
      setTimeout(() => setCopiedChatId(null), 2000);
    } catch (err) {
      console.error("Failed to copy link:", err);
      toast.error("Failed to copy link");
    }
  };

  // Revoke single shared link
  const handleRevokeShare = (chat: SidebarChat) => {
    updateVisibilityMutation.mutate({
      chatId: chat.id,
      visibility: "PRIVATE",
      chatTitle: chat.title,
    });
  };

  // Revoke all shared links
  const handleRevokeAll = () => {
    if (sharedChats.length === 0 || revokeAllMutation.isPending) return;
    revokeAllMutation.mutate();
  };

  // Bulk Delete All Chats Handler
  const handleDeleteAllChats = async () => {
    await deleteAllChatsMutation.mutateAsync();
  };

  // Delete MCP Usage Events Handler
  const handleDeleteMcpUsageEvents = async () => {
    await deleteMcpUsageMutation.mutateAsync();
  };

  return (
    <div className="flex-1 h-full overflow-y-auto scrollbar-minimal w-full">
      <div className="w-full max-w-3xl px-6 py-8 pb-20 space-y-7">
        {/* Header */}
        <div className="space-y-1 pb-4 border-b border-border">
          <h1 className="text-lg font-semibold tracking-tight text-foreground font-sans">
            Data Controls
          </h1>
          <p className="text-xs text-muted-foreground">
            Manage your chat data, file storage, and shared links.
          </p>
        </div>

        <div className="space-y-6">
          {/* Section 1: File Storage */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 pt-4 border-t border-border first:pt-0 first:border-t-0">
            <div className="space-y-1">
              <h3 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <HardDrive className="size-3.5 text-muted-foreground" />
                File Storage
              </h3>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Workspace knowledge files and attachment storage.
              </p>
            </div>

            <div className="md:col-span-2 bg-card border border-border rounded-md p-4 space-y-3.5">
              <div className="flex items-baseline justify-between gap-4">
                <div className="space-y-0.5">
                  <p className="text-xs font-medium text-foreground">Storage Allocation</p>
                  <p className="text-xs font-mono text-muted-foreground">
                    <span className="text-foreground font-medium">
                      {formatBytes(usedBytes)}
                    </span>{" "}
                    used of {formatBytes(limitBytes)}
                  </p>
                </div>
              </div>

              {/* Minimal Monochrome Progress Bar with clear dark mode contrast */}
              <div className="h-1.5 w-full bg-secondary border border-border/60 rounded-full overflow-hidden">
                <div
                  className="h-full bg-foreground rounded-full transition-all duration-300"
                  style={{ width: `${percentageUsed}%` }}
                />
              </div>

              <div className="pt-2 border-t border-border/40 flex items-center justify-between text-[11px] font-mono text-muted-foreground">
                <span>Quota: 500 MB</span>
                <span>Max upload: 10 MB/file</span>
              </div>
            </div>
          </div>

          {/* Section 2: Export Data */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 pt-4 border-t border-border">
            <div className="space-y-1">
              <h3 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <FileJson className="size-3.5 text-muted-foreground" />
                Export Data
              </h3>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Download your conversation history.
              </p>
            </div>

            <div className="md:col-span-2 bg-card border border-border rounded-md p-4 space-y-3">
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-0.5 min-w-0 flex-1">
                  <p className="text-xs font-medium text-foreground">Export conversations</p>
                  <p className="text-[11px] text-muted-foreground">
                    Download all conversations as a JSON file.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => exportMutation.mutate()}
                  disabled={exportMutation.isPending}
                  className="h-8 px-3 text-xs font-medium rounded-sm border-border hover:bg-muted shrink-0 transition-all"
                >
                  {exportMutation.isPending ? (
                    <>
                      <Loader2 className="size-3.5 mr-1.5 animate-spin" />
                      Exporting...
                    </>
                  ) : (
                    <>
                      <Download className="size-3.5 mr-1.5 text-muted-foreground" />
                      Export JSON
                    </>
                  )}
                </Button>
              </div>

              <div className="pt-2 border-t border-border/40 flex items-center justify-between text-[11px] font-mono text-muted-foreground">
                <span>Stored conversations:</span>
                <span className="font-semibold text-foreground">{chats?.length || 0}</span>
              </div>
            </div>
          </div>

          {/* Section 3: Shared Links Management */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 pt-4 border-t border-border">
            <div className="space-y-1">
              <h3 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Share2 className="size-3.5 text-muted-foreground" />
                Shared Links
              </h3>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Manage your public share links.
              </p>
            </div>

            <div className="md:col-span-2 bg-card border border-border rounded-md p-4 space-y-4">
              <div className="flex items-center justify-between gap-2 pb-2 border-b border-border/40">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-foreground">Active Shared Links</span>
                  <span className="px-1.5 py-0.2 text-[10px] font-mono rounded-xs bg-muted text-muted-foreground">
                    {sharedChats.length}
                  </span>
                </div>
                {sharedChats.length > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleRevokeAll}
                    disabled={revokeAllMutation.isPending}
                    className="h-6 px-2 text-[11px] font-medium text-destructive hover:text-destructive hover:bg-destructive/10 rounded-xs"
                  >
                    {revokeAllMutation.isPending ? (
                      <>
                        <Loader2 className="size-3 mr-1 animate-spin" />
                        Revoking...
                      </>
                    ) : (
                      "Revoke all"
                    )}
                  </Button>
                )}
              </div>

              {sharedChats.length === 0 ? (
                <div className="py-6 text-center space-y-1.5">
                  <div className="size-8 mx-auto rounded-sm bg-muted/60 flex items-center justify-center">
                    <Globe className="size-4 text-muted-foreground" />
                  </div>
                  <p className="text-xs font-medium text-foreground">No shared links</p>
                  <p className="text-[11px] text-muted-foreground max-w-sm mx-auto">
                    Chats you share publicly will appear here.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-border/40 -mx-1">
                  {sharedChats.map((chat) => {
                    const isRevoking =
                      updateVisibilityMutation.isPending &&
                      updateVisibilityMutation.variables?.chatId === chat.id;
                    const isCopied = copiedChatId === chat.id;
                    return (
                      <div
                        key={chat.id}
                        className="py-2.5 px-1.5 flex items-center justify-between gap-3 hover:bg-background/50 rounded-sm transition-colors"
                      >
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <p className="text-xs font-medium text-foreground truncate">
                            {chat.title || "Untitled Conversation"}
                          </p>
                          <div className="flex items-center gap-2 text-[10px] font-mono text-muted-foreground">
                            <span>Updated {formatDate(chat.updated_at)}</span>
                            <span>·</span>
                            <span className="text-muted-foreground font-medium">Public</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <SimpleTooltip content={isCopied ? "Copied!" : "Copy public link"}>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => handleCopyLink(chat.id)}
                              className="h-7 w-7 p-0 rounded-xs text-muted-foreground hover:text-foreground"
                            >
                              {isCopied ? (
                                <Check className="size-3.5 text-foreground" />
                              ) : (
                                <Copy className="size-3.5" />
                              )}
                            </Button>
                          </SimpleTooltip>

                          <SimpleTooltip content="Open shared page">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              asChild
                              className="h-7 w-7 p-0 rounded-xs text-muted-foreground hover:text-foreground"
                            >
                              <a
                                href={`/share/${chat.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <ExternalLink className="size-3.5" />
                              </a>
                            </Button>
                          </SimpleTooltip>

                          <SimpleTooltip content="Revoke access and make private">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => handleRevokeShare(chat)}
                              disabled={isRevoking}
                              className="h-7 px-2 text-[11px] rounded-xs border-border hover:border-destructive/30 hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition-all ml-1"
                            >
                              {isRevoking ? (
                                <Loader2 className="size-3 animate-spin" />
                              ) : (
                                <>
                                  <Lock className="size-3 mr-1" />
                                  Make Private
                                </>
                              )}
                            </Button>
                          </SimpleTooltip>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Section 4: Danger Zone */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 pt-4 border-t border-border">
            <div className="space-y-1">
              <h3 className="text-xs font-semibold text-destructive flex items-center gap-1.5">
                <ShieldAlert className="size-3.5 text-destructive" />
                Danger Zone
              </h3>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Irreversible actions for your stored data.
              </p>
            </div>

            <div className="md:col-span-2 bg-card border border-destructive/20 rounded-md p-4 space-y-4">
              {/* 1. Delete All Files */}
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-0.5 min-w-0 flex-1">
                  <p className="text-xs font-medium text-foreground">Delete all files</p>
                  <p className="text-[11px] text-muted-foreground">
                    Permanently delete all workspace knowledge files and clear storage quota.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setDeleteFilesDialogOpen(true)}
                  disabled={usedBytes === 0}
                  className="h-8 px-3 text-xs font-medium text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30 rounded-sm shrink-0 transition-all disabled:opacity-40"
                >
                  <Trash2 className="size-3.5 mr-1.5" />
                  Delete all files
                </Button>
              </div>

              <div className="border-t border-destructive/20" />

              {/* 2. Delete All Projects */}
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-0.5 min-w-0 flex-1">
                  <p className="text-xs font-medium text-foreground">Delete all projects</p>
                  <p className="text-[11px] text-muted-foreground">
                    Permanently remove all projects, custom instructions, and attached files.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setDeleteProjectsDialogOpen(true)}
                  disabled={!projects || projects.length === 0}
                  className="h-8 px-3 text-xs font-medium text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30 rounded-sm shrink-0 transition-all disabled:opacity-40"
                >
                  <Trash2 className="size-3.5 mr-1.5" />
                  Delete all projects
                </Button>
              </div>

              <div className="border-t border-destructive/20" />

              {/* 3. Delete MCP Usage Events */}
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-0.5 min-w-0 flex-1">
                  <p className="text-xs font-medium text-foreground">Delete MCP usage events</p>
                  <p className="text-[11px] text-muted-foreground">
                    Permanently remove MCP dashboard activity and usage metrics.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setDeleteUsageEventsDialogOpen(true)}
                  className="h-8 px-3 text-xs font-medium text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30 rounded-sm shrink-0 transition-all"
                >
                  <Trash2 className="size-3.5 mr-1.5" />
                  Delete usage events
                </Button>
              </div>

              <div className="border-t border-destructive/20" />

              {/* 4. Delete All Conversations */}
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-0.5 min-w-0 flex-1">
                  <p className="text-xs font-medium text-foreground">Delete all conversations</p>
                  <p className="text-[11px] text-muted-foreground">
                    Permanently remove all conversations and history.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setDeleteDialogOpen(true)}
                  disabled={!chats || chats.length === 0}
                  className="h-8 px-3 text-xs font-medium text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30 rounded-sm shrink-0 transition-all disabled:opacity-40"
                >
                  <Trash2 className="size-3.5 mr-1.5" />
                  Delete all chats
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Dialogs */}
      <DeleteAllChatsDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleDeleteAllChats}
        chatCount={chats?.length}
      />
      <DeleteMcpUsageEventsDialog
        open={deleteUsageEventsDialogOpen}
        onOpenChange={setDeleteUsageEventsDialogOpen}
        onConfirm={handleDeleteMcpUsageEvents}
      />
      <DeleteAllProjectsDialog
        open={deleteProjectsDialogOpen}
        onOpenChange={setDeleteProjectsDialogOpen}
        onConfirm={async () => {
          await deleteAllProjectsMutation.mutateAsync();
        }}
        projectCount={projects?.length}
      />
      <DeleteAllFilesDialog
        open={deleteFilesDialogOpen}
        onOpenChange={setDeleteFilesDialogOpen}
        onConfirm={async () => {
          await deleteAllFilesMutation.mutateAsync();
        }}
        fileCount={storage?.file_count}
      />
    </div>
  );
}
