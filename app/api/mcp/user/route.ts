import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { USER_MCP_SERVERS_QUERY } from "@/lib/graphql";

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ errors: [{ message: "Unauthorized" }] }, { status: 401 });
  }

  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  const origin = (process.env.DJANGO_API_URL || process.env.BACKEND_URL)?.replace(/\/$/, "");
  if (!origin) {
    return NextResponse.json({ errors: [{ message: "Server misconfigured" }] }, { status: 500 });
  }

  const resp = await fetch(`${origin}/api/graphql`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ query: USER_MCP_SERVERS_QUERY }),
    cache: "no-store",
  });

  const data = await resp.text();
  return new NextResponse(data, { status: resp.status, headers: { "content-type": "application/json" } });
}
