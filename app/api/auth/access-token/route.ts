import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Returns the current user's Supabase access JWT for use with workflow-automation-engine OAuth (paste into /oauth/authorize) or Authorization: Bearer on /mcp.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session?.access_token) {
    return NextResponse.json(
      { error: "No active session. Sign in again." },
      { status: 401 }
    );
  }

  return NextResponse.json({
    access_token: session.access_token,
    expires_at: session.expires_at ?? null,
    expires_in: session.expires_in ?? null,
    token_type: "bearer",
  });
}
