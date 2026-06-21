import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export type McpOAuthGrantRow = {
  id: string;
  client_id: string;
  client_name: string | null;
  redirect_uri: string;
  scope: string;
  token_prefix: string;
  created_at: string;
  expires_at: string | null;
  last_used_at: string | null;
};

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("mcp_oauth_grants")
    .select("id, client_id, client_name, redirect_uri, scope, token_prefix, created_at, expires_at, last_used_at")
    .eq("user_id", user.id)
    .is("revoked_at", null)
    .or(`expires_at.is.null,expires_at.gt.${now}`)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: error.message, hint: "Run mcp_oauth_grants migration in Supabase." },
      { status: 500 }
    );
  }

  return NextResponse.json({ grants: (data ?? []) as McpOAuthGrantRow[] });
}
