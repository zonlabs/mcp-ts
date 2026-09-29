import { useCallback, useMemo } from "react";
import {
  useInfiniteQuery,
  useQuery,
  useMutation,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import { toast } from "react-hot-toast";
import type {
  SidebarChat,
  PaginatedSidebarChats,
  StoredChatData,
  UpdateChatParams,
} from "@/types";
import { chatsApi } from "@/lib/api";

export type { StoredChatData, UpdateChatParams };

/**
 * React Query cache key for user sidebar chats with infinite pagination.
 */
export const SIDEBAR_CHATS_QUERY_KEY = ["sidebar-chats"] as const;

/**
 * Standard page size for fetching paginated sidebar chats.
 */
export const SIDEBAR_CHATS_PAGE_SIZE = 20;

/**
 * Custom hook to manage sidebar chats with infinite pagination and in-memory cache operations.
 *
 * @param initialData - Optional preloaded chats from server-side rendering.
 * @param options - Configuration options, including whether the query is enabled.
 * @returns Object containing the flattened chats list, pagination controls, loading states, and cache helper functions.
 */
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
      try {
        return await chatsApi.list(SIDEBAR_CHATS_PAGE_SIZE, pageParam);
      } catch {
        return { chats: [], hasMore: false, nextOffset: null };
      }
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
   *
   * @param chat - Partial chat object containing at least the unique chat `id`.
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
   *
   * @param chatId - The unique identifier of the chat to remove.
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

/**
 * Custom TanStack Query hook to fetch a single chat's messages and metadata by ID.
 * Automatically deduplicates concurrent requests, shares cache across components, and eliminates race conditions.
 *
 * @param chatId - The unique identifier of the chat, or null/undefined if no chat is active.
 * @param options - Optional query configuration such as `enabled` and `limit`.
 * @returns The query result including chat data ({ messages, hasMore, oldestCursor }), loading state, and refetch handler.
 */
export function useStoredChat(
  chatId: string | null | undefined,
  options?: { enabled?: boolean; limit?: number }
) {
  return useQuery<StoredChatData, Error>({
    queryKey: ["chat", chatId],
    queryFn: async () => {
      if (!chatId) return { messages: [], hasMore: false, oldestCursor: null };
      return await chatsApi.getById(chatId, { limit: options?.limit ?? 30 });
    },
    enabled: Boolean(chatId) && (options?.enabled ?? true),
    staleTime: 1000 * 60 * 5, // 5 minutes fresh cache
    refetchOnWindowFocus: false,
  });
}

/**
 * Mutation hook for updating chat properties (e.g. title, pinned status, visibility).
 * Optimistically updates:
 * 1. The sidebar chats infinite query cache (`SIDEBAR_CHATS_QUERY_KEY`).
 * 2. Any active project query cache containing the chat (`["project"]`).
 * 3. The single chat query cache (`["chat", id]`).
 * Automatically rolls back optimistic changes if the mutation fails.
 *
 * @returns TanStack Query mutation object for updating chats.
 */
export function useUpdateChat() {
  const queryClient = useQueryClient();

  return useMutation<
    { id: string; [key: string]: any },
    Error,
    UpdateChatParams,
    { previousSidebar: any; previousProjects: [any, any][] }
  >({
    mutationFn: async ({ id, ...updates }) => {
      await chatsApi.update(id, updates);
      return { id, ...updates };
    },
    onMutate: async ({ id, ...updates }) => {
      await queryClient.cancelQueries({ queryKey: SIDEBAR_CHATS_QUERY_KEY });
      await queryClient.cancelQueries({ queryKey: ["project"] });

      const previousSidebar = queryClient.getQueryData(SIDEBAR_CHATS_QUERY_KEY);
      const previousProjects = queryClient.getQueriesData({ queryKey: ["project"] });

      // Optimistically update sidebar
      queryClient.setQueryData<InfiniteData<PaginatedSidebarChats>>(
        SIDEBAR_CHATS_QUERY_KEY,
        (old) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              chats: page.chats.map((c) =>
                c.id === id
                  ? {
                      ...c,
                      ...updates,
                      updated_at: new Date().toISOString(),
                    }
                  : c
              ),
            })),
          };
        }
      );

      // Optimistically update any project query containing this chat
      queryClient.setQueriesData({ queryKey: ["project"] }, (old: any) => {
        if (!old || !Array.isArray(old.chats)) return old;
        return {
          ...old,
          chats: old.chats.map((c: any) =>
            c.id === id
              ? {
                  ...c,
                  ...updates,
                  updated_at: new Date().toISOString(),
                }
              : c
          ),
        };
      });

      return { previousSidebar, previousProjects };
    },
    onError: (err, _vars, context) => {
      if (context?.previousSidebar) {
        queryClient.setQueryData(SIDEBAR_CHATS_QUERY_KEY, context.previousSidebar);
      }
      if (context?.previousProjects) {
        for (const [key, data] of context.previousProjects) {
          queryClient.setQueryData(key, data);
        }
      }
      toast.error(err.message || "Failed to update chat");
    },
    onSettled: (_data, _err, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["chat", id] });
    },
  });
}

/**
 * Mutation hook for deleting a chat by ID.
 * Optimistically removes the chat from:
 * 1. The sidebar chats infinite query cache (`SIDEBAR_CHATS_QUERY_KEY`).
 * 2. Any active project query cache containing the chat (`["project"]`).
 * Automatically rolls back optimistic changes if the mutation fails.
 *
 * @returns TanStack Query mutation object for deleting chats.
 */
export function useDeleteChat() {
  const queryClient = useQueryClient();

  return useMutation<
    string,
    Error,
    string,
    { previousSidebar: any; previousProjects: [any, any][] }
  >({
    mutationFn: async (id: string) => {
      await chatsApi.delete(id);
      return id;
    },
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: SIDEBAR_CHATS_QUERY_KEY });
      await queryClient.cancelQueries({ queryKey: ["project"] });

      const previousSidebar = queryClient.getQueryData(SIDEBAR_CHATS_QUERY_KEY);
      const previousProjects = queryClient.getQueriesData({ queryKey: ["project"] });

      // Optimistically remove from sidebar
      queryClient.setQueryData<InfiniteData<PaginatedSidebarChats>>(
        SIDEBAR_CHATS_QUERY_KEY,
        (old) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              chats: page.chats.filter((c) => c.id !== id),
            })),
          };
        }
      );

      // Optimistically remove from project queries
      queryClient.setQueriesData({ queryKey: ["project"] }, (old: any) => {
        if (!old || !Array.isArray(old.chats)) return old;
        return {
          ...old,
          chats: old.chats.filter((c: any) => c.id !== id),
        };
      });

      return { previousSidebar, previousProjects };
    },
    onError: (err, _id, context) => {
      if (context?.previousSidebar) {
        queryClient.setQueryData(SIDEBAR_CHATS_QUERY_KEY, context.previousSidebar);
      }
      if (context?.previousProjects) {
        for (const [key, data] of context.previousProjects) {
          queryClient.setQueryData(key, data);
        }
      }
      toast.error(err.message || "Failed to delete chat");
    },
    onSettled: (id) => {
      if (id) {
        queryClient.removeQueries({ queryKey: ["chat", id] });
      }
    },
  });
}

export { useStoredChat as useChatData };
