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

  const userEmail = user.email?.toLowerCase();

  // Find shared project IDs and directly shared chat IDs
  let sharedProjectIds: string[] = [];
  let sharedChatIds: string[] = [];

  if (userEmail) {
    const [projSharesRes, chatSharesRes] = await Promise.all([
      supabase.from("project_shares").select("project_id").ilike("email", userEmail),
      supabase.from("chat_shares").select("chat_id").ilike("email", userEmail),
    ]);

    if (projSharesRes.data && projSharesRes.data.length > 0) {
      sharedProjectIds = projSharesRes.data.map((s) => s.project_id);
    }
    if (chatSharesRes.data && chatSharesRes.data.length > 0) {
      sharedChatIds = chatSharesRes.data.map((s) => s.chat_id);
    }
  }

  let query = supabase
    .from("chats")
    .select("id, title, updated_at, created_at, visibility, is_pinned, user_id, project_id");

  const orConditions: string[] = [`user_id.eq.${user.id}`];
  if (sharedProjectIds.length > 0) {
    orConditions.push(`project_id.in.(${sharedProjectIds.join(",")})`);
  }
  if (sharedChatIds.length > 0) {
    orConditions.push(`id.in.(${sharedChatIds.join(",")})`);
  }

  query = query.or(orConditions.join(","));

  const { data, error } = await query
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
