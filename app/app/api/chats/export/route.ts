import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/chats/export
 * Exports conversations for the authenticated user as a downloadable JSON file.
 * Query parameters:
 *  - id?: string (optional single chat export)
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const chatId = searchParams.get("id");

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let query = supabase
    .from("chats")
    .select(`
      id,
      title,
      visibility,
      is_pinned,
      created_at,
      updated_at,
      chat_messages (
        id,
        external_id,
        role,
        parts,
        attachments,
        created_at,
        prompt_tokens,
        completion_tokens,
        total_tokens
      )
    `)
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  if (chatId) {
    query = query.eq("id", chatId);
  }

  const { data: chats, error } = await query;

  if (error) {
    console.error("[api/chats/export] GET error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const exportPayload = {
    exportedAt: new Date().toISOString(),
    account: {
      userId: user.id,
      email: user.email,
    },
    totalConversations: chats?.length || 0,
    conversations: (chats || []).map((chat: any) => ({
      id: chat.id,
      title: chat.title || "Untitled Conversation",
      visibility: chat.visibility,
      isPinned: chat.is_pinned,
      createdAt: chat.created_at,
      updatedAt: chat.updated_at,
      messages: (chat.chat_messages || []).sort(
        (a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      ),
    })),
  };

  const formattedDate = new Date().toISOString().slice(0, 10);
  const filename = chatId && chats?.[0]
    ? `chat-export-${(chats[0].title || "conversation").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 30)}-${formattedDate}.json`
    : `web-assistant-chats-${formattedDate}.json`;

  return new NextResponse(JSON.stringify(exportPayload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
