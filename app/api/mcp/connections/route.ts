import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveMcpConnections } from "@/lib/mcp-connections";

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const connections = await getActiveMcpConnections(user.id);
    return NextResponse.json({
      success: true,
      connections,
      count: connections.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch connections";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
