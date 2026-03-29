import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REMOTE_PROXY_BASE_URL = (process.env.REMOTE_PROXY_BASE_URL || "https://hub.linkos.in/agent").replace(/\/+$/, "");

async function getSubjectFromSession(): Promise<string> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const uid = user?.id || "";
  if (!uid) {
    throw new Error("Unauthorized");
  }
  const subject = uid.slice(-10);
  if (!subject) {
    throw new Error("Unauthorized");
  }
  return subject;
}

export async function GET() {
  try {
    const subject = await getSubjectFromSession();

    const upstream = await fetch(`${REMOTE_PROXY_BASE_URL}/manage/agents/stream?subject=${encodeURIComponent(subject)}`, {
      method: "GET",
      cache: "no-store",
      headers: {
        Accept: "text/event-stream",
      },
    });

    if (!upstream.ok || !upstream.body) {
      const text = await upstream.text();
      return NextResponse.json(
        { error: text || `Failed to connect stream: ${upstream.status} ${upstream.statusText}` },
        { status: 502 }
      );
    }

    return new Response(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected stream error";
    const status = message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
