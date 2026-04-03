import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Rotates the session and returns a new access token (same Supabase project). */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase.auth.refreshSession();

  if (error || !data.session?.access_token) {
    return NextResponse.json(
      { error: error?.message ?? "Could not refresh session. Sign in again." },
      { status: 400 }
    );
  }

  return NextResponse.json({
    access_token: data.session.access_token,
    expires_at: data.session.expires_at ?? null,
    expires_in: data.session.expires_in ?? null,
    token_type: "bearer",
  });
}
