"use client";

import MainHeader from "@/components/common/MainHeader";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useMcpStore } from "@/lib/stores/mcp-store";

export default function MainLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    const pathname = usePathname();
    const isDashboard = pathname?.startsWith("/mcp") || 
                        pathname?.startsWith("/workflows") || 
                        pathname?.startsWith("/remote-mcp") ||
                        pathname?.startsWith("/gateway");

    const sidebarOpen = useMcpStore((state) => state.sidebarOpen);

    return (
        <div className="min-h-screen flex flex-col">
            <MainHeader />
            <div className={cn(
                "mx-auto w-full flex-1 flex flex-col transition-all duration-300",
                (isDashboard && !sidebarOpen) ? "max-w-none px-4 sm:px-6 lg:px-8" : "max-w-5xl"
            )}>
                <main className="flex-1 flex flex-col">{children}</main>
            </div>
        </div>
    );
}


