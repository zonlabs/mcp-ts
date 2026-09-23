import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * GET /api/projects/:id/shares
 */
export async function GET(req: Request, context: RouteContext) {
  const { id: projectId } = await context.params;
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: project, error: projError } = await supabase
    .from("projects")
    .select("id, user_id, visibility, name")
    .eq("id", projectId)
    .maybeSingle();

  if (projError || !project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const isOwner = project.user_id === user.id;

  const { data: shares, error: sharesError } = await supabase
    .from("project_shares")
    .select("id, email, role, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });

  if (sharesError) {
    console.error("[api/projects/shares] Failed to fetch shares:", sharesError);
    return NextResponse.json({ error: "Failed to fetch shares" }, { status: 500 });
  }

  return NextResponse.json({
    projectId: project.id,
    visibility: project.visibility,
    isOwner,
    shares: shares || [],
  });
}

/**
 * POST /api/projects/:id/shares
 */
export async function POST(req: Request, context: RouteContext) {
  const { id: projectId } = await context.params;
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: project, error: projError } = await supabase
    .from("projects")
    .select("id, user_id")
    .eq("id", projectId)
    .maybeSingle();

  if (projError || !project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  if (project.user_id !== user.id) {
    return NextResponse.json({ error: "Only the project owner can manage collaborators" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const rawEmail = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const role = body.role === "editor" ? "editor" : "viewer";

  if (!rawEmail || !EMAIL_REGEX.test(rawEmail)) {
    return NextResponse.json({ error: "Please provide a valid email address" }, { status: 400 });
  }

  if (user.email && rawEmail === user.email.toLowerCase()) {
    return NextResponse.json({ error: "You are already the owner of this project" }, { status: 400 });
  }

  const { data: share, error: upsertError } = await supabase
    .from("project_shares")
    .upsert(
      {
        project_id: projectId,
        email: rawEmail,
        role,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "project_id,email" }
    )
    .select("id, project_id, email, role, created_at, updated_at")
    .single();

  if (upsertError) {
    console.error("[api/projects/shares] Upsert error:", upsertError);
    return NextResponse.json({ error: upsertError.message || "Failed to add collaborator" }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    share,
  });
}

/**
 * PATCH /api/projects/:id/shares
 */
export async function PATCH(req: Request, context: RouteContext) {
  const { id: projectId } = await context.params;
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: project, error: projError } = await supabase
    .from("projects")
    .select("id, user_id, visibility")
    .eq("id", projectId)
    .maybeSingle();

  if (projError || !project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  if (project.user_id !== user.id) {
    return NextResponse.json({ error: "Only the project owner can manage collaborators" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));

  if (body.visibility === "PRIVATE" || body.visibility === "PUBLIC") {
    const { error: visError } = await supabase
      .from("projects")
      .update({ visibility: body.visibility, updated_at: new Date().toISOString() })
      .eq("id", projectId);

    if (visError) {
      console.error("[api/projects/shares] Visibility error:", visError);
      return NextResponse.json({ error: "Failed to update visibility" }, { status: 500 });
    }
  }

  if (typeof body.email === "string" && (body.role === "viewer" || body.role === "editor")) {
    const email = body.email.trim().toLowerCase();
    const { data: updated, error: updateError } = await supabase
      .from("project_shares")
      .update({ role: body.role, updated_at: new Date().toISOString() })
      .eq("project_id", projectId)
      .eq("email", email)
      .select("id, email, role")
      .single();

    if (updateError) {
      console.error("[api/projects/shares] Role update error:", updateError);
      return NextResponse.json({ error: "Failed to update collaborator role" }, { status: 500 });
    }

    return NextResponse.json({ success: true, share: updated });
  }

  return NextResponse.json({ success: true });
}

/**
 * DELETE /api/projects/:id/shares
 */
export async function DELETE(req: Request, context: RouteContext) {
  const { id: projectId } = await context.params;
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

  const { data: project, error: projError } = await supabase
    .from("projects")
    .select("id, user_id")
    .eq("id", projectId)
    .maybeSingle();

  if (projError || !project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  if (project.user_id !== user.id) {
    return NextResponse.json({ error: "Only the project owner can remove collaborators" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const rawEmail = emailParam || (typeof body.email === "string" ? body.email : "");
  const email = rawEmail.trim().toLowerCase();

  if (!email) {
    return NextResponse.json({ error: "Missing email parameter" }, { status: 400 });
  }

  const { error: deleteError } = await supabase
    .from("project_shares")
    .delete()
    .eq("project_id", projectId)
    .eq("email", email);

  if (deleteError) {
    console.error("[api/projects/shares] Delete error:", deleteError);
    return NextResponse.json({ error: "Failed to remove collaborator" }, { status: 500 });
  }

  return NextResponse.json({ success: true, removed: email });
}
