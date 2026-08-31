import { AppShell } from "@/components/layout/AppShell";
import { loadSidebarChats } from "@/lib/sidebar-chats.server";
import type { PropsWithChildren } from "react";

export default async function MainLayout({ children }: PropsWithChildren) {
  const initialChats = await loadSidebarChats();
  return <AppShell initialChats={initialChats}>{children}</AppShell>;
}
