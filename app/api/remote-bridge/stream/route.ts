import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REMOTE_PROXY_BASE_URL = (process.env.REMOTE_PROXY_BASE_URL || "https://hub.linkos.in/agent").replace(/\/+$/, "");

export async function GET() {
  try {
    const upstream = await fetch(`${REMOTE_PROXY_BASE_URL}/manage/agents/stream`, {
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
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
