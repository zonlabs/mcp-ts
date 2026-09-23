import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * GET /api/chats/:id/shares
 * Returns chat visibility and list of shared collaborators.
 */
export async function GET(req: Request, context: RouteContext) {
  const { id: chatId } = await context.params;
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check chat existence and permission
  const { data: chat, error: chatError } = await supabase
    .from("chats")
    .select("id, user_id, visibility, title")
    .eq("id", chatId)
    .maybeSingle();

  if (chatError || !chat) {
    return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  }

  const isOwner = chat.user_id === user.id;

  // If not owner, check if user is an existing collaborator
  if (!isOwner) {
    const userEmail = user.email?.toLowerCase();
    const { data: userShare } = await supabase
      .from("chat_shares")
      .select("id, role")
      .eq("chat_id", chatId)
      .eq("email", userEmail)
      .maybeSingle();

    if (!userShare && chat.visibility !== "PUBLIC") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  // Load collaborators
  const { data: shares, error: sharesError } = await supabase
    .from("chat_shares")
    .select("id, email, role, created_at")
    .eq("chat_id", chatId)
    .order("created_at", { ascending: true });

  if (sharesError) {
    console.error("[api/chats/shares] Failed to fetch shares:", sharesError);
    return NextResponse.json({ error: "Failed to fetch shares" }, { status: 500 });
  }

  return NextResponse.json({
    chatId: chat.id,
    visibility: chat.visibility,
    isOwner,
    shares: shares || [],
  });
}

/**
 * POST /api/chats/:id/shares
 * Adds or updates a collaborator by email.
 * Body: { email: string, role?: 'viewer' | 'editor' }
 */
export async function POST(req: Request, context: RouteContext) {
  const { id: chatId } = await context.params;
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify owner
  const { data: chat, error: chatError } = await supabase
    .from("chats")
    .select("id, user_id")
    .eq("id", chatId)
    .maybeSingle();

  if (chatError || !chat) {
    return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  }

  if (chat.user_id !== user.id) {
    return NextResponse.json({ error: "Only the chat owner can manage collaborators" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const rawEmail = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const role = body.role === "editor" ? "editor" : "viewer";

  if (!rawEmail || !EMAIL_REGEX.test(rawEmail)) {
    return NextResponse.json({ error: "Please provide a valid email address" }, { status: 400 });
  }

  if (user.email && rawEmail === user.email.toLowerCase()) {
    return NextResponse.json({ error: "You are already the owner of this chat" }, { status: 400 });
  }

  const { data: share, error: upsertError } = await supabase
    .from("chat_shares")
    .upsert(
      {
        chat_id: chatId,
        email: rawEmail,
        role,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "chat_id,email" }
    )
    .select("id, chat_id, email, role, created_at, updated_at")
    .single();

  if (upsertError) {
    console.error("[api/chats/shares] Upsert error:", upsertError);
    return NextResponse.json({ error: upsertError.message || "Failed to add collaborator" }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    share,
  });
}

/**
 * PATCH /api/chats/:id/shares
 * Updates a collaborator's role or chat visibility.
 * Body: { email?: string, role?: 'viewer' | 'editor', visibility?: 'PRIVATE' | 'PUBLIC' }
 */
export async function PATCH(req: Request, context: RouteContext) {
  const { id: chatId } = await context.params;
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify owner
  const { data: chat, error: chatError } = await supabase
    .from("chats")
    .select("id, user_id, visibility")
    .eq("id", chatId)
    .maybeSingle();

  if (chatError || !chat) {
    return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  }

  if (chat.user_id !== user.id) {
    return NextResponse.json({ error: "Only the chat owner can manage collaborators" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));

  // Update visibility if requested
  if (body.visibility === "PRIVATE" || body.visibility === "PUBLIC") {
    const { error: visError } = await supabase
      .from("chats")
      .update({ visibility: body.visibility, updated_at: new Date().toISOString() })
      .eq("id", chatId);

    if (visError) {
      console.error("[api/chats/shares] Visibility error:", visError);
      return NextResponse.json({ error: "Failed to update visibility" }, { status: 500 });
    }
  }

  // Update role if email is provided
  if (typeof body.email === "string" && (body.role === "viewer" || body.role === "editor")) {
    const email = body.email.trim().toLowerCase();
    const { data: updated, error: updateError } = await supabase
      .from("chat_shares")
      .update({ role: body.role, updated_at: new Date().toISOString() })
      .eq("chat_id", chatId)
      .eq("email", email)
      .select("id, email, role")
      .single();

    if (updateError) {
      console.error("[api/chats/shares] Role update error:", updateError);
      return NextResponse.json({ error: "Failed to update collaborator role" }, { status: 500 });
    }

    return NextResponse.json({ success: true, share: updated });
  }

  return NextResponse.json({ success: true });
}

/**
 * DELETE /api/chats/:id/shares
 * Removes a collaborator.
 * Query or body: email
 */
export async function DELETE(req: Request, context: RouteContext) {
  const { id: chatId } = await context.params;
  const { searchParams } = new URL(req.url);
  const emailParam = searchParams.get("email");

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify owner
  const { data: chat, error: chatError } = await supabase
    .from("chats")
    .select("id, user_id")
    .eq("id", chatId)
    .maybeSingle();

  if (chatError || !chat) {
    return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  }

  if (chat.user_id !== user.id) {
    return NextResponse.json({ error: "Only the chat owner can remove collaborators" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const rawEmail = emailParam || (typeof body.email === "string" ? body.email : "");
  const email = rawEmail.trim().toLowerCase();

  if (!email) {
    return NextResponse.json({ error: "Missing email parameter" }, { status: 400 });
  }

  const { error: deleteError } = await supabase
    .from("chat_shares")
    .delete()
    .eq("chat_id", chatId)
    .eq("email", email);

  if (deleteError) {
    console.error("[api/chats/shares] Delete error:", deleteError);
    return NextResponse.json({ error: "Failed to remove collaborator" }, { status: 500 });
  }

  return NextResponse.json({ success: true, removed: email });
}
