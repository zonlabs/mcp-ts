"use client";
import { User, ChevronDown } from "lucide-react";
import Image from "next/image";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { SignOutButton } from "@/components/common/SignOutButton";

import { User as SupabaseUser } from "@supabase/supabase-js";

interface ProfileDropdownProps {
  user: SupabaseUser;
}

export function ProfileDropdown({ user }: ProfileDropdownProps) {
  const name = user.user_metadata?.full_name || user.email?.split('@')[0];
  const image = user.user_metadata?.avatar_url;
  const email = user.email;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="flex items-center gap-2 px-2">
          {image ? (
            <Image
              src={image}
              alt={name || "Profile"}
              width={32}
              height={32}
              className="rounded-full"
            />
          ) : (
            <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
              <User className="h-4 w-4 text-primary" />
            </div>
          )}
          <span className="hidden xl:inline text-sm font-medium max-w-[140px] truncate">
            {name}
          </span>
          <ChevronDown className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuItem asChild>
          <SignOutButton />
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
