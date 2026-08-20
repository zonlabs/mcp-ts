"use client";

import React from "react";
import {
  User,
  ChevronUp,
  KeyRound,
  ShieldOff,
  SlidersHorizontal,
  FileText,
  LogOut,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { signOutAndRedirect } from "@/components/common/SignOutButton";
import { User as SupabaseUser } from "@supabase/supabase-js";
import { cn } from "@/lib/utils";

interface ProfileDropdownProps {
  user: SupabaseUser;
  trigger?: React.ReactNode;
}

export function ProfileDropdown({ user, trigger }: ProfileDropdownProps) {
  const name =
    user.user_metadata?.full_name?.trim() ||
    user.email?.split("@")[0] ||
    "Account";
  const image = user.user_metadata?.avatar_url;
  const email = user.email;
  const pathname = usePathname();
  const menuLabel = name || email || "Account menu";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {trigger ?? (
          <Button
            type="button"
            variant="ghost"
            className="h-8 shrink-0 gap-1.5 rounded-sm px-1.5 hover:bg-card text-muted-foreground hover:text-foreground transition-colors"
            aria-label={menuLabel}
            aria-haspopup="menu"
          >
            {image ? (
              <Image
                src={image}
                alt=""
                width={26}
                height={26}
                className="rounded-sm object-cover"
                loading="eager"
                priority
                aria-hidden
              />
            ) : (
              <div className="flex size-6.5 items-center justify-center rounded-sm bg-primary/10 text-primary">
                <User className="size-3.5" strokeWidth={2} aria-hidden />
              </div>
            )}
          </Button>
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-56 p-1.5 bg-popover border-border rounded-sm shadow-md font-sans text-xs"
      >
        {/* User Info Header */}
        <DropdownMenuLabel className="mb-1 rounded-xs bg-card/60 border border-border/40 px-2.5 py-2 font-normal">
          <p className="truncate text-xs font-semibold text-foreground">
            {name}
          </p>
          {email ? (
            <p className="mt-0.5 truncate text-[11px] font-mono text-muted-foreground">
              {email}
            </p>
          ) : null}
        </DropdownMenuLabel>

        {/* Workspace & Settings Options */}
        <DropdownMenuItem asChild className="cursor-pointer gap-2.5 rounded-xs px-2.5 py-1.5 text-xs text-foreground hover:bg-card">
          <Link
            href="/settings/api-keys"
            className={cn(pathname.startsWith("/settings/api-keys") && "bg-card font-medium text-foreground")}
          >
            <KeyRound className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.8} />
            <span>API Keys</span>
          </Link>
        </DropdownMenuItem>

        <DropdownMenuItem asChild className="cursor-pointer gap-2.5 rounded-xs px-2.5 py-1.5 text-xs text-foreground hover:bg-card">
          <Link
            href="/settings/access"
            className={cn(pathname.startsWith("/settings/access") && "bg-card font-medium text-foreground")}
          >
            <ShieldOff className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.8} />
            <span>Access</span>
          </Link>
        </DropdownMenuItem>

        <DropdownMenuItem asChild className="cursor-pointer gap-2.5 rounded-xs px-2.5 py-1.5 text-xs text-foreground hover:bg-card">
          <Link
            href="/settings/preferences"
            className={cn(
              pathname.startsWith("/settings/preferences") &&
                "bg-card font-medium text-foreground"
            )}
          >
            <SlidersHorizontal className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.8} />
            <span>Settings</span>
          </Link>
        </DropdownMenuItem>

        <DropdownMenuItem asChild className="cursor-pointer gap-2.5 rounded-xs px-2.5 py-1.5 text-xs text-foreground hover:bg-card">
          <Link
            href="/settings/account"
            className={cn(pathname.startsWith("/settings/account") && "bg-card font-medium text-foreground")}
          >
            <User className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.8} />
            <span>Accounts</span>
          </Link>
        </DropdownMenuItem>

        <DropdownMenuSeparator className="my-1 bg-border/60" />

        <DropdownMenuItem asChild className="cursor-pointer gap-2.5 rounded-xs px-2.5 py-1.5 text-xs text-foreground hover:bg-card">
          <a href="https://docs.mcp-assistant.in/" target="_blank" rel="noopener noreferrer">
            <FileText className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.8} />
            <span>Documentation</span>
          </a>
        </DropdownMenuItem>

        <DropdownMenuSeparator className="my-1 bg-border/60" />

        <DropdownMenuItem
          variant="destructive"
          className="cursor-pointer gap-2.5 rounded-xs px-2.5 py-1.5 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive transition-colors"
          onSelect={() => {
            void signOutAndRedirect();
          }}
        >
          <LogOut className="size-3.5 shrink-0" strokeWidth={1.8} />
          <span>Sign out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
