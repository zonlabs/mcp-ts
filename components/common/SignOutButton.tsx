"use client";

import { LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export async function signOutAndRedirect() {
  const supabase = createClient();
  await supabase.auth.signOut();
  window.location.href = "/";
}

export function SignOutButton() {
  return (
    <button
      type="button"
      onClick={() => void signOutAndRedirect()}
      className="flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm transition-colors hover:bg-muted"
    >
      <LogOut className="h-4 w-4" />
      <span>Sign out</span>
    </button>
  );
}
