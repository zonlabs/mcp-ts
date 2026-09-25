"use client";

import React, { useState } from "react";
import {
  MoreHorizontal,
  Pin,
  PinOff,
  Pencil,
  ExternalLink,
  Share2,
  Link as LinkIcon,
  Download,
  X,
} from "lucide-react";
import { toast } from "react-hot-toast";
import { useAuth } from "@/components/providers/AuthProvider";
import type { SidebarChat } from "@/lib/sidebar-chats";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { SimpleTooltip } from "@/components/ui/tooltip";

export interface ChatContextMenuProps {
  chat: SidebarChat;
  onDelete: (id: string) => void;
  onTogglePin: (id: string, pinned: boolean) => void;
  onRename: (id: string, title: string) => void;
  onShare: (chat: SidebarChat) => void;
}

export function ChatContextMenu({
  chat,
  onDelete,
  onTogglePin,
  onRename,
  onShare,
}: ChatContextMenuProps) {
  const [open, setOpen] = useState(false);
  const { userSession } = useAuth();
  const isOwner = Boolean(
    userSession?.user?.id && (chat.user_id ? chat.user_id === userSession.user.id : true)
  );

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <SimpleTooltip content={open ? null : "More options"}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onPointerDown={(e) => {
              e.stopPropagation();
            }}
            className="opacity-0 group-hover:opacity-100 p-1 rounded-sm text-muted-foreground hover:text-foreground hover:bg-card/80 transition-all cursor-pointer"
            aria-label="More options"
          >
            <MoreHorizontal className="size-[18px]" />
          </button>
        </DropdownMenuTrigger>
      </SimpleTooltip>
      <DropdownMenuContent
        align="end"
        sideOffset={4}
        className="w-44 text-[12px] font-sans"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        {isOwner && (
          <DropdownMenuItem
            onSelect={() => {
              setOpen(false);
              onTogglePin(chat.id, !chat.is_pinned);
            }}
            className="gap-2 py-1.5 cursor-pointer"
          >
            {chat.is_pinned ? (
              <PinOff className="size-[18px] text-muted-foreground" />
            ) : (
              <Pin className="size-[18px] text-muted-foreground" />
            )}
            {chat.is_pinned ? "Unpin chat" : "Pin chat"}
          </DropdownMenuItem>
        )}
        {isOwner && (
          <DropdownMenuItem
            onSelect={() => {
              setOpen(false);
              onRename(chat.id, chat.title || "New Chat");
            }}
            className="gap-2 py-1.5 cursor-pointer"
          >
            <Pencil className="size-[18px] text-muted-foreground" />
            Rename
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          onSelect={() => {
            setOpen(false);
            window.open(`/chat/${chat.id}`, "_blank", "noopener,noreferrer");
          }}
          className="gap-2 py-1.5 cursor-pointer"
        >
          <ExternalLink className="size-[18px] text-muted-foreground" />
          Open in new tab
        </DropdownMenuItem>
        {isOwner ? (
          <DropdownMenuItem
            onSelect={() => {
              setOpen(false);
              onShare(chat);
            }}
            className="gap-2 py-1.5 cursor-pointer"
          >
            <Share2 className="size-[18px] text-muted-foreground" />
            Share
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem
            onSelect={() => {
              setOpen(false);
              const origin = typeof window !== "undefined" ? window.location.origin : "";
              const url = `${origin}/share/${chat.id}`;
              navigator.clipboard.writeText(url);
              toast.success("Link copied to clipboard");
            }}
            className="gap-2 py-1.5 cursor-pointer"
          >
            <LinkIcon className="size-[18px] text-muted-foreground" />
            Copy link
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          onSelect={() => {
            setOpen(false);
            window.location.href = `/api/chats/export?id=${chat.id}`;
          }}
          className="gap-2 py-1.5 cursor-pointer"
        >
          <Download className="size-[18px] text-muted-foreground" />
          Export JSON
        </DropdownMenuItem>
        {isOwner && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => {
                setOpen(false);
                onDelete(chat.id);
              }}
              className="gap-2 py-1.5 cursor-pointer text-destructive focus:text-destructive"
            >
              <X className="size-[18px] text-destructive" />
              Delete
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
