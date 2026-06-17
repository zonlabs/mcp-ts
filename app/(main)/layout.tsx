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
                        pathname?.startsWith("/gateway");

    const sidebarOpen = useMcpStore((state) => state.sidebarOpen);

    return (
        <div className="h-screen flex flex-col overflow-y-auto scrollbar-minimal">
            <MainHeader />
            <div className={cn(
                "mx-auto w-full flex-1 flex flex-col min-h-0 transition-all duration-300",
                (isDashboard && !sidebarOpen) ? "max-w-none" : "max-w-5xl"
            )}>
                <main className={cn(
                    "flex-1 flex flex-col min-h-0",
                    isDashboard && "overflow-hidden"
                )}>{children}</main>
            </div>
        </div>
    );
}


