export type SidebarChat = {
  id: string;
  title: string | null;
  updated_at: string | null;
  created_at: string | null;
  visibility?: string | null;
  is_pinned?: boolean | null;
  user_id?: string | null;
  project_id?: string | null;
};

export type PaginatedSidebarChats = {
  chats: SidebarChat[];
  hasMore: boolean;
  nextOffset: number | null;
};

export function normalizeSidebarChats(chats: SidebarChat[]): SidebarChat[] {
  return chats.map((chat) => ({
    ...chat,
    is_pinned: Boolean(chat.is_pinned),
  }));
}
