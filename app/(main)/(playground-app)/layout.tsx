"use client";

import { PlaygroundProvider } from "@/components/providers/PlaygroundProvider";
import { PlaygroundSidebar } from "@/components/playground/PlaygroundSidebar";
import type { PropsWithChildren } from "react";

export default function PlaygroundAppLayout({ children }: PropsWithChildren) {
  return (
    <div className="fixed inset-0 z-50 bg-background">
      <PlaygroundProvider>
        <div className="flex h-screen flex-col md:flex-row bg-background text-foreground">
          <PlaygroundSidebar />
          <main className="flex-1 min-h-0 flex flex-col relative overflow-hidden">
            {children}
          </main>
        </div>
      </PlaygroundProvider>
    </div>
  );
}
