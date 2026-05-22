export type SidebarChat = {
  id: string;
  title: string | null;
  updated_at: string | null;
  created_at: string | null;
  visibility?: string | null;
  is_pinned?: boolean | null;
};

export function normalizeSidebarChats(chats: SidebarChat[]): SidebarChat[] {
  return chats.map((chat) => ({
    ...chat,
    is_pinned: chat.is_pinned ?? false,
  }));
}
