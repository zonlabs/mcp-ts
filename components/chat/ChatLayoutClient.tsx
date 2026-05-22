"use client";

import type { PropsWithChildren, ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Toaster } from "react-hot-toast";
import { SettingsSidebar } from "@/components/settings/SettingsSidebar";
import { cn } from "@/lib/utils";

interface PlaygroundLayoutChromeProps extends PropsWithChildren {
  sidebar: ReactNode;
}

export function ChatLayoutClient({
  sidebar,
  children,
}: PlaygroundLayoutChromeProps) {
  const pathname = usePathname();
  const showSettingsSidebar = pathname?.startsWith("/settings");

  return (
    <>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 3000,
          style: {
            background: "rgba(255, 255, 255, 0.95)",
            color: "#000000",
            border: "1px solid #e5e7eb",
            boxShadow:
              "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)",
            backdropFilter: "blur(8px)",
          },
        }}
      />
      <div className="flex h-[100dvh] min-h-[100dvh] flex-col bg-background text-foreground md:flex-row">
        {sidebar}
        {showSettingsSidebar ? <SettingsSidebar /> : null}
        <main
          className={cn(
            "relative flex min-h-0 flex-1 flex-col",
            showSettingsSidebar
              ? "overflow-y-auto px-3 py-4 md:px-6 md:py-10"
              : "overflow-hidden"
          )}
        >
          {children}
        </main>
      </div>
    </>
  );
}
