import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { deleteAllProjectFiles } from "@/lib/projects";

export const FREE_TIER_STORAGE_LIMIT_BYTES = 500 * 1024 * 1024; // 500 MB

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { data: files, error } = await supabase
      .from("project_files")
      .select("size_bytes")
      .eq("user_id", user.id);

    if (error) {
      return NextResponse.json({
        used_bytes: 0,
        limit_bytes: FREE_TIER_STORAGE_LIMIT_BYTES,
        file_count: 0,
      });
    }

    const usedBytes = (files || []).reduce(
      (acc, curr) => acc + (curr.size_bytes || 0),
      0
    );

    return NextResponse.json({
      used_bytes: usedBytes,
      limit_bytes: FREE_TIER_STORAGE_LIMIT_BYTES,
      file_count: files?.length || 0,
    });
  } catch {
    return NextResponse.json({
      used_bytes: 0,
      limit_bytes: FREE_TIER_STORAGE_LIMIT_BYTES,
      file_count: 0,
    });
  }
}

/**
 * DELETE /api/storage?all=true
 * Bulk delete all uploaded project files, clearing storage usage.
 */
export async function DELETE(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const all = searchParams.get("all") === "true";

  if (!all) {
    return NextResponse.json({ error: "Missing all=true parameter" }, { status: 400 });
  }

  try {
    await deleteAllProjectFiles(user.id);
    return NextResponse.json({ success: true, message: "All files deleted" });
  } catch (error: any) {
    console.error("[API /api/storage] DELETE error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to delete files" },
      { status: 500 }
    );
  }
}
