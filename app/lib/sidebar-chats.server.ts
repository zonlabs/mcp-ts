import { createClient } from "@/lib/supabase/server";
import {
  normalizeSidebarChats,
  type SidebarChat,
  type PaginatedSidebarChats,
} from "@/lib/sidebar-chats";

export const SIDEBAR_CHATS_PAGE_SIZE = 20;

export async function loadSidebarChats(options?: {
  limit?: number;
  offset?: number;
}): Promise<PaginatedSidebarChats> {
  const limit = options?.limit ?? SIDEBAR_CHATS_PAGE_SIZE;
  const offset = options?.offset ?? 0;

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { chats: [], hasMore: false, nextOffset: null };
  }

  const { data, error } = await supabase
    .from("chats")
    .select("id, title, updated_at, created_at, visibility, is_pinned, user_id, project_id")
    .eq("user_id", user.id)
    .order("is_pinned", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false })
    .range(offset, offset + limit);

  if (error) {
    console.error("[sidebar-chats] failed to load chats:", error);
    return { chats: [], hasMore: false, nextOffset: null };
  }

  const raw = Array.isArray(data) ? data : [];
  const hasMore = raw.length > limit;
  const pageItems = hasMore ? raw.slice(0, limit) : raw;
  const nextOffset = hasMore ? offset + limit : null;

  return {
    chats: normalizeSidebarChats(pageItems),
    hasMore,
    nextOffset,
  };
}
