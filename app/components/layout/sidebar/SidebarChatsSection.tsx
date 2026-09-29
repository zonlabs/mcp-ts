"use client";

import React, { useState, useEffect, useRef } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { SidebarChat } from "@/lib/sidebar-chats";
import { SidebarChatSkeleton } from "@/components/layout/SidebarChatSkeleton";
import { ChatItem } from "./ChatItem";

export interface SidebarChatsSectionProps {
  isExpanded: boolean;
  pinned: SidebarChat[];
  todayChats: SidebarChat[];
  yesterdayChats: SidebarChat[];
  olderChats: SidebarChat[];
  currentChatId: string | null;
  isChatsLoading: boolean;
  hasMore: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
  onDeleteChat: (id: string) => void;
  onTogglePinChat: (id: string, pinned: boolean) => void;
  onRenameChat: (id: string, title: string) => void;
  onShareChat: (chat: SidebarChat) => void;
  onItemClick?: () => void;
}

export function SidebarChatsSection({
  isExpanded,
  pinned,
  todayChats,
  yesterdayChats,
  olderChats,
  currentChatId,
  isChatsLoading,
  hasMore,
  isFetchingNextPage,
  fetchNextPage,
  onDeleteChat,
  onTogglePinChat,
  onRenameChat,
  onShareChat,
  onItemClick,
}: SidebarChatsSectionProps) {
  const [pinnedOpen, setPinnedOpen] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(true);
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sentinel = loadMoreSentinelRef.current;
    if (!sentinel || !hasMore || isFetchingNextPage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          fetchNextPage();
        }
      },
      { threshold: 0.1, rootMargin: "100px" }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, isFetchingNextPage, fetchNextPage]);

  if (!isExpanded) {
    return null;
  }

  const hasNoChats =
    pinned.length === 0 &&
    todayChats.length === 0 &&
    yesterdayChats.length === 0 &&
    olderChats.length === 0;

  return (
    <>
      {/* Pinned Section */}
      {pinned.length > 0 && (
        <div className="pt-2">
          <div className="w-full flex items-center justify-between px-2 py-1 group/pinned-header">
            <button
              type="button"
              onClick={() => setPinnedOpen((o) => !o)}
              className="flex items-center gap-1.5 text-xs font-semibold text-sidebar-foreground/80 hover:text-sidebar-foreground transition-colors cursor-pointer"
            >
              <span className="text-[13px]">Pinned</span>
              <span className="transition-opacity opacity-0 group-hover/pinned-header:opacity-100">
                {pinnedOpen ? (
                  <ChevronDown className="size-3.5 text-muted-foreground" />
                ) : (
                  <ChevronRight className="size-3.5 text-muted-foreground" />
                )}
              </span>
            </button>
          </div>

          {pinnedOpen && (
            <div className="mt-1 space-y-0.5 px-0.5">
              {pinned.map((chat) => (
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
          )}
        </div>
      )}

      {/* Chats / History Section */}
      <div className="pt-3">
        <div className="w-full flex items-center justify-between px-2 py-1 group/chats-header">
          <button
            type="button"
            onClick={() => setHistoryOpen((o) => !o)}
            className="flex items-center gap-1.5 text-xs font-semibold text-sidebar-foreground/80 hover:text-sidebar-foreground transition-colors cursor-pointer"
          >
            <span className="text-[13px]">Chats</span>
            <span className="transition-opacity opacity-0 group-hover/chats-header:opacity-100">
              {historyOpen ? (
                <ChevronDown className="size-3.5 text-muted-foreground" />
              ) : (
                <ChevronRight className="size-3.5 text-muted-foreground" />
              )}
            </span>
          </button>
        </div>

        {historyOpen && (
          <div className="mt-1 space-y-1">
            {isChatsLoading && hasNoChats ? (
              <SidebarChatSkeleton count={8} className="px-1" />
            ) : (
              <>
                {hasNoChats && (
                  <div className="px-3 py-2 text-xs text-muted-foreground/60 select-none">
                    No chats yet
                  </div>
                )}

                {/* Today */}
                {todayChats.length > 0 && (
                  <div>
                    <p className="px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-sidebar-foreground/60 font-medium">
                      Today
                    </p>
                    <div className="space-y-0.5 px-1">
                      {todayChats.map((chat) => (
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
                  </div>
                )}

                {/* Yesterday */}
                {yesterdayChats.length > 0 && (
                  <div>
                    <p className="px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-sidebar-foreground/60 font-medium">
                      Yesterday
                    </p>
                    <div className="space-y-0.5 px-1">
                      {yesterdayChats.map((chat) => (
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
                  </div>
                )}

                {/* Older */}
                {olderChats.length > 0 && (
                  <div>
                    <p className="px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-sidebar-foreground/60 font-medium">
                      Older
                    </p>
                    <div className="space-y-0.5 px-1">
                      {olderChats.map((chat) => (
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
                  </div>
                )}

                {/* Infinite scroll sentinel & skeleton */}
                {hasMore && (
                  <div ref={loadMoreSentinelRef} className="py-1 px-1">
                    {isFetchingNextPage ? (
                      <SidebarChatSkeleton count={4} />
                    ) : (
                      <button
                        type="button"
                        onClick={() => fetchNextPage()}
                        className="w-full text-center py-1 text-[11px] text-muted-foreground/60 hover:text-foreground font-mono transition-colors cursor-pointer"
                      >
                        Load more
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}
