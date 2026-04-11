import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { deleteUserMcpServer, saveUserMcpServer } from "@/lib/mcp-servers/service";
import { restMcpServer } from "@/lib/mcp-servers/rest-serialize";
import { storeServerEmbeddings, deleteServerEmbeddings } from "@/lib/ai/embedding";

async function getSessionUser() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return null;
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;
  return { supabase, user, session };
}

async function handleEmbeddings(saved: { id: string; name: string; description: string | null; url: string | null; transport: string }, userId: string) {
  try {
    const embeddingContent = [saved.name, saved.description].filter(Boolean).join(". ");
    await storeServerEmbeddings(
      saved.id,
      embeddingContent,
      {
        name: saved.name,
        url: saved.url ?? undefined,
        remoteUrl: saved.url ?? undefined,
        transport: saved.transport,
        description: saved.description ?? undefined,
      },
      userId
    );
  } catch (err) {
    console.error("Background Embedding Error:", err);
  }
}

/** POST /api/mcp/servers — create or update (REST body = form payload). */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getSessionUser();
    if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await request.json()) as Record<string, unknown>;
    const saved = await saveUserMcpServer(ctx.supabase, ctx.user.id, body);
    await handleEmbeddings(
      {
        id: saved.id,
        name: saved.name,
        description: saved.description,
        url: saved.url,
        transport: saved.transport,
      },
      ctx.user.id
    );

    return NextResponse.json({ server: restMcpServer(saved) });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    console.error("Error saving MCP server:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** DELETE /api/mcp/servers?id=…&name=… */
export async function DELETE(request: NextRequest) {
  try {
    const ctx = await getSessionUser();
    if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const serverId = request.nextUrl.searchParams.get("id")?.trim() || "";
    let serverName = request.nextUrl.searchParams.get("name")?.trim() || "";

    if (!serverName && !serverId) {
      return NextResponse.json({ error: "Server id or name is required" }, { status: 400 });
    }

    let ok: boolean;
    if (serverId) {
      ok = await deleteUserMcpServer(ctx.supabase, ctx.user.id, { id: serverId });
      if (ok) {
        await deleteServerEmbeddings({ serverId });
      }
    } else {
      ok = await deleteUserMcpServer(ctx.supabase, ctx.user.id, { name: serverName });
      if (ok) {
        await deleteServerEmbeddings({ serverName });
      }
    }

    return NextResponse.json({ ok });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
