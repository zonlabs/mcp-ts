import { useCallback, useMemo } from "react";
import { useInfiniteQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import type { SidebarChat, PaginatedSidebarChats } from "@/lib/sidebar-chats";

export const SIDEBAR_CHATS_QUERY_KEY = ["sidebar-chats"] as const;
export const SIDEBAR_CHATS_PAGE_SIZE = 20;

export function useSidebarChats(
  initialData?: PaginatedSidebarChats | SidebarChat[],
  options?: { enabled?: boolean }
) {
  const queryClient = useQueryClient();

  const normalizedInitialData: PaginatedSidebarChats | undefined = useMemo(() => {
    if (!initialData) return undefined;
    if (Array.isArray(initialData)) {
      return initialData.length > 0
        ? {
            chats: initialData,
            hasMore: initialData.length >= SIDEBAR_CHATS_PAGE_SIZE,
            nextOffset: initialData.length,
          }
        : undefined;
    }
    return initialData.chats && initialData.chats.length > 0 ? initialData : undefined;
  }, [initialData]);

  const query = useInfiniteQuery<
    PaginatedSidebarChats,
    Error,
    InfiniteData<PaginatedSidebarChats>,
    typeof SIDEBAR_CHATS_QUERY_KEY,
    number
  >({
    queryKey: SIDEBAR_CHATS_QUERY_KEY,
    queryFn: async ({ pageParam = 0 }) => {
      const res = await fetch(
        `/api/chats?limit=${SIDEBAR_CHATS_PAGE_SIZE}&offset=${pageParam}`
      );
      if (!res.ok) return { chats: [], hasMore: false, nextOffset: null };
      return res.json();
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore && lastPage.nextOffset !== null ? lastPage.nextOffset : undefined,
    initialData: normalizedInitialData
      ? {
          pages: [normalizedInitialData],
          pageParams: [0],
        }
      : undefined,
    enabled: options?.enabled ?? true,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  // Flatten all pages into a deduplicated list
  const chats = useMemo(() => {
    if (!query.data?.pages) return [];
    const seen = new Set<string>();
    const all: SidebarChat[] = [];

    for (const page of query.data.pages) {
      for (const chat of page.chats) {
        if (!seen.has(chat.id)) {
          seen.add(chat.id);
          all.push(chat);
        }
      }
    }
    return all;
  }, [query.data?.pages]);

  /**
   * Deterministically upserts a chat into the local React Query cache.
   */
  const upsertChat = useCallback(
    (chat: Partial<SidebarChat> & { id: string }) => {
      queryClient.setQueryData<InfiniteData<PaginatedSidebarChats>>(
        SIDEBAR_CHATS_QUERY_KEY,
        (old) => {
          if (!old || old.pages.length === 0) return old;
          const now = new Date().toISOString();
          let found = false;

          const newPages = old.pages.map((page) => {
            const index = page.chats.findIndex((c) => c.id === chat.id);
            if (index === -1) return page;

            found = true;
            const updatedList = [...page.chats];
            updatedList[index] = {
              ...updatedList[index],
              ...chat,
              title: chat.title !== undefined ? chat.title : updatedList[index].title,
              is_pinned:
                chat.is_pinned !== undefined
                  ? Boolean(chat.is_pinned)
                  : updatedList[index].is_pinned,
              updated_at: chat.updated_at || now,
              project_id:
                chat.project_id !== undefined
                  ? chat.project_id
                  : updatedList[index].project_id,
            };
            return { ...page, chats: updatedList };
          });

          if (!found) {
            const firstPage = newPages[0];
            const newEntry: SidebarChat = {
              id: chat.id,
              title: chat.title || "New Chat",
              created_at: chat.created_at || now,
              updated_at: chat.updated_at || now,
              is_pinned: Boolean(chat.is_pinned),
              visibility: chat.visibility ?? "PRIVATE",
              user_id: chat.user_id ?? null,
              project_id: chat.project_id ?? null,
            };
            newPages[0] = {
              ...firstPage,
              chats: [newEntry, ...firstPage.chats],
            };
          }

          return { ...old, pages: newPages };
        }
      );
    },
    [queryClient]
  );

  /**
   * Removes a chat from the local React Query cache.
   */
  const removeChat = useCallback(
    (chatId: string) => {
      queryClient.setQueryData<InfiniteData<PaginatedSidebarChats>>(
        SIDEBAR_CHATS_QUERY_KEY,
        (old) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              chats: page.chats.filter((c) => c.id !== chatId),
            })),
          };
        }
      );
    },
    [queryClient]
  );

  return {
    ...query,
    chats,
    hasMore: Boolean(query.hasNextPage),
    isFetchingNextPage: query.isFetchingNextPage,
    fetchNextPage: query.fetchNextPage,
    upsertChat,
    removeChat,
  };
}
