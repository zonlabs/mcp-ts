import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const authorizationId = form.get("authorization_id") as string | null;

  if (!authorizationId) {
    return NextResponse.json({ error: "Missing authorization_id parameter" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.oauth.denyAuthorization(authorizationId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ redirect_url: data.redirect_url });
}
