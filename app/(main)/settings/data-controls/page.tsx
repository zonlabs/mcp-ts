"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
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
} from "lucide-react";
import toast from "react-hot-toast";

import { Button } from "@/components/ui/button";
import { SimpleTooltip } from "@/components/ui/tooltip";
import { useSidebarChats, SIDEBAR_CHATS_QUERY_KEY } from "@/lib/hooks/use-sidebar-chats";
import { DeleteAllChatsDialog } from "@/components/settings/DeleteAllChatsDialog";
import type { SidebarChat } from "@/lib/sidebar-chats";

export default function DataControlsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { chats, upsertChat, removeChat } = useSidebarChats();

  const [isExporting, setIsExporting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [copiedChatId, setCopiedChatId] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [isRevokingAll, setIsRevokingAll] = useState(false);

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

  // Export Data Handler
  const handleExportData = async () => {
    setIsExporting(true);
    try {
      const res = await fetch("/api/chats/export");
      if (!res.ok) {
        throw new Error("Failed to export chat data");
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `web-assistant-chats-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success("Chat export downloaded");
    } catch (err) {
      console.error("Export error:", err);
      toast.error("Failed to download chat export");
    } finally {
      setIsExporting(false);
    }
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

  // Revoke single shared link (set visibility to PRIVATE)
  const handleRevokeShare = async (chat: SidebarChat) => {
    setRevokingId(chat.id);
    try {
      const res = await fetch(`/api/chats?id=${chat.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visibility: "PRIVATE" }),
      });
      if (!res.ok) {
        throw new Error("Failed to revoke share link");
      }
      upsertChat({ id: chat.id, visibility: "PRIVATE" });
      await queryClient.invalidateQueries({ queryKey: SIDEBAR_CHATS_QUERY_KEY });
      toast.success(`Share link revoked for "${chat.title || "Untitled"}"`);
    } catch (err) {
      console.error("Revoke error:", err);
      toast.error("Failed to revoke share link");
    } finally {
      setRevokingId(null);
    }
  };

  // Revoke all shared links
  const handleRevokeAll = async () => {
    if (sharedChats.length === 0 || isRevokingAll) return;
    setIsRevokingAll(true);
    try {
      const res = await fetch("/api/chats?revokeAll=true", {
        method: "PATCH",
      });
      if (!res.ok) {
        throw new Error("Failed to revoke all share links");
      }
      sharedChats.forEach((chat) => {
        upsertChat({ id: chat.id, visibility: "PRIVATE" });
      });
      await queryClient.invalidateQueries({ queryKey: SIDEBAR_CHATS_QUERY_KEY });
      toast.success("All shared links revoked");
    } catch (err) {
      console.error("Revoke all error:", err);
      toast.error("Failed to revoke all share links");
    } finally {
      setIsRevokingAll(false);
    }
  };

  // Bulk Delete All Chats Handler
  const handleDeleteAllChats = async () => {
    const res = await fetch("/api/chats?all=true", {
      method: "DELETE",
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Failed to delete all conversations");
    }
    // Clear sidebar chats cache immediately and invalidate
    queryClient.setQueryData(SIDEBAR_CHATS_QUERY_KEY, { chats: [] });
    await queryClient.invalidateQueries({ queryKey: SIDEBAR_CHATS_QUERY_KEY });
    toast.success("All conversations permanently deleted");
    router.push("/chat");
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
            Manage your chat data, shared links, and exports.
          </p>
        </div>

        <div className="space-y-6">
          {/* Section 1: Export Data */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 pt-4 border-t border-border first:pt-0 first:border-t-0">
            <div className="space-y-1">
              <h3 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <FileJson className="size-3.5 text-muted-foreground" />
                Export Data
              </h3>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Download your conversation history.
              </p>
            </div>

            <div className="md:col-span-2 bg-card border border-border rounded-md p-4 space-y-3 shadow-xs">
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
                  onClick={handleExportData}
                  disabled={isExporting}
                  className="h-8 px-3 text-xs font-medium rounded-sm border-border hover:bg-muted shrink-0 transition-all"
                >
                  {isExporting ? (
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

          {/* Section 2: Shared Links Management */}
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

            <div className="md:col-span-2 bg-card border border-border rounded-md p-4 space-y-4 shadow-xs">
              <div className="flex items-center justify-between gap-2 pb-2 border-b border-border/40">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-foreground">Active Shared Links</span>
                  <span className="px-1.5 py-0.2 text-[10px] font-mono rounded-xs bg-muted border border-border text-muted-foreground">
                    {sharedChats.length}
                  </span>
                </div>
                {sharedChats.length > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleRevokeAll}
                    disabled={isRevokingAll}
                    className="h-6 px-2 text-[11px] font-medium text-destructive hover:text-destructive hover:bg-destructive/10 rounded-xs"
                  >
                    {isRevokingAll ? (
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
                  <div className="size-8 mx-auto rounded-sm bg-muted/60 border border-border/60 flex items-center justify-center">
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
                    const isRevoking = revokingId === chat.id;
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
                            <span className="text-emerald-500 font-medium">Public</span>
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
                                <Check className="size-3.5 text-emerald-500" />
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
                              className="h-7 px-2 text-[11px] rounded-xs border-border hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 text-muted-foreground transition-all ml-1"
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

          {/* Section 3: Danger Zone */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 pt-4 border-t border-border">
            <div className="space-y-1">
              <h3 className="text-xs font-semibold text-destructive flex items-center gap-1.5">
                <ShieldAlert className="size-3.5" />
                Danger Zone
              </h3>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Permanent actions for your data.
              </p>
            </div>

            <div className="md:col-span-2 bg-card border border-destructive/20 rounded-md p-4 space-y-4 shadow-xs">
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

      {/* Confirmation Dialog */}
      <DeleteAllChatsDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleDeleteAllChats}
        chatCount={chats?.length}
      />
    </div>
  );
}
