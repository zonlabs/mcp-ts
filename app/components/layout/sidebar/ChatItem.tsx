"use client";

import React from "react";
import Link from "next/link";
import { Pin, Share2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { SimpleTooltip } from "@/components/ui/tooltip";
import type { SidebarChat } from "@/lib/sidebar-chats";
import { ChatContextMenu } from "./context-menus/ChatContextMenu";

export function formatChatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export interface ChatItemProps {
  chat: SidebarChat;
  isActive: boolean;
  onDelete: (id: string) => void;
  onTogglePin: (id: string, pinned: boolean) => void;
  onRename: (id: string, title: string) => void;
  onShare: (chat: SidebarChat) => void;
  onClick?: () => void;
}

export function ChatItem({
  chat,
  isActive,
  onDelete,
  onTogglePin,
  onRename,
  onShare,
  onClick,
}: ChatItemProps) {
  const href = chat.project_id
    ? `/projects/${chat.project_id}/chat/${chat.id}`
    : `/chat/${chat.id}`;

  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        "group flex items-start justify-between gap-1 px-2 py-1 rounded-sm transition-colors",
        isActive
          ? "bg-sidebar-accent text-sidebar-foreground font-medium"
          : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
      )}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          {chat.is_pinned && (
            <Pin className="size-3.5 shrink-0 text-foreground/75" strokeWidth={2.4} />
          )}
          {chat.visibility === "PUBLIC" && (
            <SimpleTooltip content="Publicly shared">
              <span
                className="shrink-0 flex items-center text-foreground/75 hover:text-foreground"
                aria-label="Publicly shared"
              >
                <Share2 className="size-3.5 shrink-0 text-primary/70" />
              </span>
            </SimpleTooltip>
          )}
          <p className="text-[13px] font-medium leading-snug truncate">
            {chat.title || "New Chat"}
          </p>
        </div>
        <p className="text-[10px] font-mono text-muted-foreground/70 mt-0.5">
          {formatChatDate(chat.updated_at || chat.created_at)}
        </p>
      </div>
      <ChatContextMenu
        chat={chat}
        onDelete={onDelete}
        onTogglePin={onTogglePin}
        onRename={onRename}
        onShare={onShare}
      />
    </Link>
  );
}
