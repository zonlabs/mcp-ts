import { PlaygroundSidebar } from "@/components/chat/PlaygroundSidebar";
import { ChatLayoutClient } from "@/components/chat/ChatLayoutClient";
import type { PropsWithChildren } from "react";

export default function PlaygroundAppLayout({ children }: PropsWithChildren) {
  return (
    <div className="fixed inset-0 z-50 bg-background">
      <ChatLayoutClient sidebar={<PlaygroundSidebar />}>
        {children}
      </ChatLayoutClient>
    </div>
  );
}
