import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { SidebarChat } from "@/lib/sidebar-chats";

export const SIDEBAR_CHATS_QUERY_KEY = ["sidebar-chats"] as const;

export function useSidebarChats(
  initialChats?: SidebarChat[],
  options?: { enabled?: boolean }
) {
  const queryClient = useQueryClient();

  const query = useQuery<{ chats: SidebarChat[] }>({
    queryKey: SIDEBAR_CHATS_QUERY_KEY,
    queryFn: async () => {
      const res = await fetch("/api/chats");
      if (!res.ok) return { chats: [] };
      return res.json();
    },
    initialData:
      initialChats && initialChats.length > 0 ? { chats: initialChats } : undefined,
    enabled: options?.enabled ?? true,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  /**
   * Deterministically upserts a chat into the local React Query cache.
   * If it's a new chat, it prepends to the list; if existing, updates fields in-place.
   */
  const upsertChat = useCallback((chat: Partial<SidebarChat> & { id: string }) => {
    queryClient.setQueryData<{ chats: SidebarChat[] }>(SIDEBAR_CHATS_QUERY_KEY, (old) => {
      const list = old?.chats ?? [];
      const index = list.findIndex((c) => c.id === chat.id);
      const now = new Date().toISOString();

      if (index === -1) {
        const newEntry: SidebarChat = {
          id: chat.id,
          title: chat.title || "New Chat",
          created_at: chat.created_at || now,
          updated_at: chat.updated_at || now,
          is_pinned: chat.is_pinned ?? false,
          visibility: chat.visibility ?? "PRIVATE",
          user_id: chat.user_id ?? null,
        };
        return { chats: [newEntry, ...list] };
      }

      const updated = [...list];
      updated[index] = {
        ...updated[index],
        ...chat,
        title: chat.title !== undefined ? chat.title : updated[index].title,
        updated_at: chat.updated_at || now,
      };
      return { chats: updated };
    });
  }, [queryClient]);

  /**
   * Removes a chat from the local React Query cache.
   */
  const removeChat = useCallback((chatId: string) => {
    queryClient.setQueryData<{ chats: SidebarChat[] }>(SIDEBAR_CHATS_QUERY_KEY, (old) => ({
      chats: (old?.chats ?? []).filter((c) => c.id !== chatId),
    }));
  }, [queryClient]);

  return {
    ...query,
    chats: query.data?.chats ?? [],
    upsertChat,
    removeChat,
  };
}
