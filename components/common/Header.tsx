"use client";

import Link from "next/link";
import { ThemeToggle } from "@/components/common/ThemeToggle";
import Logo from "@/components/common/Logo";
import { ProfileDropdown } from "@/components/common/ProfileDropdown";
import { NavigationLinks } from "@/components/common/NavigationLinks";
import { useAuth } from "@/components/providers/AuthProvider";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { MessageSquare, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export default function Header() {
  const { userSession } = useAuth();
  const user = userSession?.user;
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-[200] w-full bg-background/95 backdrop-blur-md select-none font-sans">
      <div className="w-full max-w-[1360px] mx-auto px-6 sm:px-8 lg:px-12 h-13 flex items-center justify-between">
        {/* Left: Logo & Wordmark */}
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2.5 group">
            <Logo size={28} />
            <span className="text-sm font-semibold text-foreground tracking-tight">
              MCP Assistant
            </span>
          </Link>
        </div>

        {/* Center: Desktop Navigation Links */}
        <div className="hidden md:flex items-center">
          <NavigationLinks />
        </div>

        {/* Right: Actions, Theme, and Profile */}
        <div className="flex items-center gap-2.5">
          <Button asChild size="sm" variant="outline" className="hidden sm:flex h-8 px-3 text-xs gap-1.5 border-border bg-card">
            <Link href="/chat">
              <MessageSquare className="size-3.5" />
              <span>Playground</span>
            </Link>
          </Button>

          <ThemeToggle />

          {user ? (
            <ProfileDropdown user={user} />
          ) : (
            <Link
              href="/signin"
              className="bg-primary text-primary-foreground px-3 py-1.5 rounded-sm text-xs font-medium hover:bg-primary/90 transition-colors"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
