import { createClient } from "@/lib/supabase/server";
import { normalizeSidebarChats, type SidebarChat } from "@/lib/sidebar-chats";

export async function loadSidebarChats(): Promise<SidebarChat[]> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) return [];

  const { data, error } = await supabase
    .from("chats")
    .select("id, title, updated_at, created_at, visibility, is_pinned, user_id")
    .eq("user_id", user.id)
    .order("is_pinned", { ascending: false })
    .order("updated_at", { ascending: false });

  if (!error) {
    return normalizeSidebarChats(Array.isArray(data) ? data : []);
  }

  const { data: fallbackData, error: fallbackError } = await supabase
    .from("chats")
    .select("id, title, updated_at, created_at, visibility, user_id")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  if (fallbackError) {
    console.error("[sidebar-chats] failed to load chats:", error);
    return [];
  }

  return normalizeSidebarChats(Array.isArray(fallbackData) ? fallbackData : []);
}
