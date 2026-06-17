"use client";

import Link from "next/link";
import { ThemeToggle } from "@/components/common/ThemeToggle";
import Logo from "@/components/common/Logo";
import { ProfileDropdown } from "@/components/common/ProfileDropdown";
import { NavigationLinks } from "@/components/common/NavigationLinks";
import { MobileNav } from "@/components/common/MobileNav";
import { useAuth } from "@/components/providers/AuthProvider";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useMcpStore } from "@/lib/stores/mcp-store";

export default function Header() {
  const { userSession } = useAuth();
  const user = userSession?.user;
  const pathname = usePathname();
  const isDashboard = pathname?.startsWith("/mcp") || 
                      pathname?.startsWith("/workflows") || 
                      pathname?.startsWith("/remote-mcp") ||
                      pathname?.startsWith("/gateway");

  const sidebarOpen = useMcpStore((state) => state.sidebarOpen);

  return (
    <nav className="sticky top-0 z-[200] bg-background">
      <div className={cn(
        "mx-auto py-3 sm:py-4 transition-all duration-300",
        (isDashboard && !sidebarOpen) ? "max-w-none px-4 sm:px-6 lg:px-8" : "max-w-5xl px-3 sm:px-4 lg:px-6"
      )}>

        <div className="relative flex items-center justify-between">
          {/* Left: Mobile menu, Logo */}
          <div className="flex items-center gap-2">
            {/* Mobile */}
            <div className="lg:hidden">
              <MobileNav />
            </div>
 
            {/* Logo */}
            <Link href="/" className="hidden lg:flex items-center gap-2">
              <Logo size={34} />
              {(!isDashboard || sidebarOpen) && (
                <span className="text-sm font-semibold text-foreground hidden sm:inline-block font-sans-original">
                  MCP Assistant
                </span>
              )}
            </Link>
          </div>

          {/* Center: Desktop Nav */}
          <div className="hidden lg:flex absolute left-1/2 -translate-x-1/2">
            <NavigationLinks />
          </div>

          {/* Right: Theme + Profile */}
          <div className="flex items-center gap-2">
            <ThemeToggle />

            {user ? (
              <ProfileDropdown user={user} />
            ) : (
              <Link
                href="/signin"
                className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                Sign in
              </Link>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
