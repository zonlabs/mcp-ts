import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function DELETE(
  _: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { error: revokeErr } = await supabase.auth.oauth.revokeGrant({ clientId: id });

  if (revokeErr) {
    return NextResponse.json({ error: revokeErr.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
