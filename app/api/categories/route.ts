import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listCategories } from "@/lib/mcp-servers/service";
import { restCategory } from "@/lib/mcp-servers/rest-serialize";

/** GET /api/categories — MCP server categories (REST). */
export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const rows = await listCategories(supabase);
    return NextResponse.json({ categories: rows.map(restCategory) });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to load categories";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
