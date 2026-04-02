"use client";

import { PlaygroundSidebar } from "@/components/playground/PlaygroundSidebar";
import type { PropsWithChildren } from "react";
import { Toaster } from "react-hot-toast";

export default function PlaygroundAppLayout({ children }: PropsWithChildren) {
  return (
    <div className="fixed inset-0 z-50 bg-background">
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 3000,
            style: {
              background: 'rgba(255, 255, 255, 0.95)',
              color: '#000000',
              border: '1px solid #e5e7eb',
              boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
              backdropFilter: 'blur(8px)',
            },
          }}
        />
        <div className="flex h-[100dvh] min-h-[100dvh] flex-col md:flex-row bg-background text-foreground">
          <PlaygroundSidebar />
          <main className="flex-1 min-h-0 flex flex-col relative overflow-hidden">
            {children}
          </main>
        </div>
    </div>
  );
}
