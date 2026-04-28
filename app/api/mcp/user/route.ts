import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listUserMcpServers } from "@/lib/mcp-servers/service";
import { restMcpServer } from "@/lib/mcp-servers/rest-serialize";

/** GET /api/mcp/user — current user's saved MCP servers (REST). Guests get an empty list. */
export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ servers: [] });
  }

  try {
    const nodes = await listUserMcpServers(supabase, user.id);
    return NextResponse.json({ servers: nodes.map(restMcpServer) });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to load servers";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
