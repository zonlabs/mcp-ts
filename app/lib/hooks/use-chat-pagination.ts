import { useState, useRef, useEffect, useCallback } from 'react';
import { chatsApi } from '@/lib/api';
import type { ChatUIMessage } from '@/agent/chat-agent';

export const CHAT_PAGE_LIMIT = 30;

function getScrollParent(node: HTMLElement | null): HTMLElement | null {
  if (typeof window === 'undefined') return null;
  let current = node?.parentElement;
  while (current) {
    const style = window.getComputedStyle(current);
    if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
      return current;
    }
    current = current.parentElement;
  }
  return null;
}

export interface UseChatPaginationOptions {
  chatId?: string;
  isNewChat?: boolean;
  limit?: number;
  onPrependMessages: (olderMessages: ChatUIMessage[]) => void;
}

export function useChatPagination({
  chatId,
  isNewChat = false,
  limit = CHAT_PAGE_LIMIT,
  onPrependMessages,
}: UseChatPaginationOptions) {
  const [hasMoreOlder, setHasMoreOlder] = useState(false);
  const [oldestCursor, setOldestCursor] = useState<string | null>(null);
  const [isFetchingOlder, setIsFetchingOlder] = useState(false);
  const topSentinelRef = useRef<HTMLDivElement | null>(null);

  // Reset pagination state when chat switches
  const prevChatIdRef = useRef(chatId);
  useEffect(() => {
    if (prevChatIdRef.current !== chatId) {
      prevChatIdRef.current = chatId;
      setHasMoreOlder(false);
      setOldestCursor(null);
      setIsFetchingOlder(false);
    }
  }, [chatId]);

  const fetchOlderMessages = useCallback(async () => {
    if (!chatId || isFetchingOlder || !hasMoreOlder || !oldestCursor) return;

    setIsFetchingOlder(true);

    const scrollContainer = getScrollParent(topSentinelRef.current);
    const prevScrollHeight = scrollContainer?.scrollHeight ?? 0;
    const prevScrollTop = scrollContainer?.scrollTop ?? 0;

    try {
      const result = await chatsApi.getById(chatId, {
        limit,
        before: oldestCursor,
      });

      if (Array.isArray(result.messages) && result.messages.length > 0) {
        onPrependMessages(result.messages);

        // Anchor scroll position so user view remains steady
        if (scrollContainer) {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              const newScrollHeight = scrollContainer.scrollHeight;
              scrollContainer.scrollTop = prevScrollTop + (newScrollHeight - prevScrollHeight);
            });
          });
        }
      }

      setHasMoreOlder(result.hasMore ?? false);
      setOldestCursor(result.oldestCursor ?? null);
    } catch (err) {
      console.error('[useChatPagination] fetchOlderMessages failed:', err);
    } finally {
      setIsFetchingOlder(false);
    }
  }, [chatId, isFetchingOlder, hasMoreOlder, oldestCursor, limit, onPrependMessages]);

  // Trigger loading older messages when top sentinel enters viewport on scroll up
  useEffect(() => {
    const sentinel = topSentinelRef.current;
    if (!sentinel || !hasMoreOlder || isFetchingOlder) return;

    const scrollContainer = getScrollParent(sentinel);

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;

        // Clean scroll guard: only fetch if content overflows AND viewport is scrolled near top
        if (scrollContainer) {
          const isScrollable = scrollContainer.scrollHeight > scrollContainer.clientHeight;
          const isNearTop = scrollContainer.scrollTop < 150;
          if (!isScrollable || !isNearTop) {
            return;
          }
        }

        fetchOlderMessages();
      },
      {
        root: scrollContainer ?? null,
        threshold: 0.1,
        rootMargin: '100px 0px 0px 0px',
      }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMoreOlder, isFetchingOlder, fetchOlderMessages]);

  return {
    hasMoreOlder,
    setHasMoreOlder,
    oldestCursor,
    setOldestCursor,
    isFetchingOlder,
    topSentinelRef,
    fetchOlderMessages,
  };
}
