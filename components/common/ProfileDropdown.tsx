"use client";

import { User, ChevronDown, Settings, LogOut, Home, Hammer, Package, MessageSquare, BookOpen } from "lucide-react";
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

interface ProfileDropdownProps {
  user: SupabaseUser;
}

export function ProfileDropdown({ user }: ProfileDropdownProps) {
  const name =
    user.user_metadata?.full_name?.trim() ||
    user.email?.split("@")[0] ||
    "Account";
  const image = user.user_metadata?.avatar_url;
  const email = user.email;
  const pathname = usePathname();
  const menuLabel = name || email || "Account menu";

  const mobileNavLinks = [
    { href: "/", label: "Home", icon: Home },
    { href: "/mcp", label: "MCP", icon: Hammer },
    { href: "/registry", label: "Registry", icon: Package },
    { href: "/chat", label: "Chat", icon: MessageSquare },
    { href: "https://docs.mcp-assistant.in/", label: "Docs", icon: BookOpen, external: true },
  ];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className="h-9 shrink-0 gap-1 rounded-full px-1.5"
          aria-label={menuLabel}
          aria-haspopup="menu"
        >
          {image ? (
            <Image
              src={image}
              alt=""
              width={32}
              height={32}
              className="rounded-full"
              loading="eager"
              priority
              aria-hidden
            />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
              <User className="h-4 w-4 text-primary" strokeWidth={2} aria-hidden />
            </div>
          )}
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={2} aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-56 p-1.5"
      >
        <DropdownMenuLabel className="mb-1 rounded-md bg-muted/50 px-2.5 py-2 font-normal">
          <p className="truncate text-sm font-medium leading-none text-foreground">
            {name}
          </p>
          {email ? (
            <p className="mt-1 truncate text-xs leading-normal text-muted-foreground">
              {email}
            </p>
          ) : null}
        </DropdownMenuLabel>

        {/* Mobile nav links — hidden on desktop */}
        <div className="lg:hidden">
          {mobileNavLinks.map((link) => {
            const Icon = link.icon;
            const isActive = !link.external && pathname === link.href;
            return (
              <DropdownMenuItem key={link.href} asChild className="cursor-pointer gap-2 rounded-md">
                <Link
                  href={link.href}
                  target={link.external ? "_blank" : undefined}
                  rel={link.external ? "noopener noreferrer" : undefined}
                  className={isActive ? "font-medium" : ""}
                >
                  <Icon className="size-4 shrink-0" strokeWidth={2} />
                  {link.label}
                </Link>
              </DropdownMenuItem>
            );
          })}
          <DropdownMenuSeparator className="my-1.5" />
        </div>

        <DropdownMenuItem asChild className="cursor-pointer gap-2 rounded-md">
          <Link href="/mcp">
            <Hammer className="size-4 shrink-0 text-muted-foreground" strokeWidth={2} />
            MCP Servers
          </Link>
        </DropdownMenuItem>

        <DropdownMenuItem asChild className="cursor-pointer gap-2 rounded-md">
          <Link href="/registry">
            <Package className="size-4 shrink-0 text-muted-foreground" strokeWidth={2} />
            Registry
          </Link>
        </DropdownMenuItem>

        <DropdownMenuItem asChild className="cursor-pointer gap-2 rounded-md">
          <Link href="/chat">
            <MessageSquare className="size-4 shrink-0 text-muted-foreground" strokeWidth={2} />
            Chat Playground
          </Link>
        </DropdownMenuItem>

        <DropdownMenuItem asChild className="cursor-pointer gap-2 rounded-md">
          <a href="https://docs.mcp-assistant.in/" target="_blank" rel="noopener noreferrer">
            <BookOpen className="size-4 shrink-0 text-muted-foreground" strokeWidth={2} />
            Docs
          </a>
        </DropdownMenuItem>

        <DropdownMenuSeparator className="my-1.5" />

        <DropdownMenuItem asChild className="cursor-pointer gap-2 rounded-md">
          <Link href="/settings/account">
            <User className="size-4 shrink-0 text-muted-foreground" strokeWidth={2} />
            Accounts
          </Link>
        </DropdownMenuItem>

        <DropdownMenuSeparator className="my-1.5" />

        <DropdownMenuItem
          variant="destructive"
          className="cursor-pointer gap-2 rounded-md"
          onSelect={() => {
            void signOutAndRedirect();
          }}
        >
          <LogOut className="size-4 shrink-0" strokeWidth={2} />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
