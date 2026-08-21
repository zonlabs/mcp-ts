import { NextResponse } from "next/server";
import { loadSidebarChats } from "@/lib/sidebar-chats.server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/chats
 * Returns the authenticated user's recent chat list for the sidebar.
 */
export async function GET() {
  const chats = await loadSidebarChats();
  return NextResponse.json({ chats });
}

/**
 * DELETE /api/chats?id=<chatId>
 * Deletes a chat belonging to the authenticated user.
 */
export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const chatId = searchParams.get("id");

  if (!chatId) {
    return NextResponse.json({ error: "Missing chat id" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Delete chat row (cascade will clean up chat_messages)
  const { data: deletedRows, error } = await supabase
    .from("chats")
    .delete()
    .eq("id", chatId)
    .eq("user_id", user.id)
    .select("id");

  if (error) {
    console.error("[api/chats] DELETE error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!deletedRows || deletedRows.length === 0) {
    return NextResponse.json(
      { error: "You can only delete chats that you created." },
      { status: 403 }
    );
  }

  return NextResponse.json({ success: true, id: chatId });
}

/**
 * PATCH /api/chats?id=<chatId>
 * Updates chat properties (is_pinned, title, visibility).
 */
export async function PATCH(req: Request) {
  const { searchParams } = new URL(req.url);
  let chatId = searchParams.get("id");
  const body = await req.json().catch(() => ({}));

  chatId = chatId || body.id;

  if (!chatId) {
    return NextResponse.json({ error: "Missing chat id" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const updates: Record<string, any> = {
    updated_at: new Date().toISOString(),
  };

  if (typeof body.is_pinned === "boolean") {
    updates.is_pinned = body.is_pinned;
  }
  if (typeof body.title === "string" && body.title.trim()) {
    updates.title = body.title.trim();
  }
  if (typeof body.visibility === "string") {
    updates.visibility = body.visibility;
  }

  const { data: updatedRows, error } = await supabase
    .from("chats")
    .update(updates)
    .eq("id", chatId)
    .eq("user_id", user.id)
    .select("id");

  if (error) {
    console.error("[api/chats] PATCH error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!updatedRows || updatedRows.length === 0) {
    return NextResponse.json(
      { error: "You can only rename or modify chats that you created." },
      { status: 403 }
    );
  }

  return NextResponse.json({ success: true, id: chatId, ...updates });
}
