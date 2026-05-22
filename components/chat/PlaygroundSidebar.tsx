import { loadSidebarChats } from "@/lib/sidebar-chats.server";
import { PlaygroundSidebarClient } from "@/components/chat/PlaygroundSidebarClient";

export async function PlaygroundSidebar() {
  const initialChats = await loadSidebarChats();

  return <PlaygroundSidebarClient initialChats={initialChats} />;
}
