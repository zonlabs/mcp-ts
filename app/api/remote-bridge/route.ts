import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type Action = "agents" | "server-info" | "issue-token" | "revoke-token";

interface RemoteBridgeRequestBody {
  action: Action;
  agentId?: string;
  mcpServer?: string;
  expiryMinutes?: number;
  token?: string;
}

const REMOTE_PROXY_BASE_URL = (process.env.REMOTE_PROXY_BASE_URL || "https://hub.linkos.in/agent").replace(/\/+$/, "");
const DEFAULT_TIMEOUT_SECONDS = Math.max(1, Math.min(60, Number(process.env.REMOTE_PROXY_TIMEOUT_SECONDS || "15")));

function jsonHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
  };
}

async function getSubjectFromSession(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const uid = session?.user?.id || "";
  if (!uid) {
    throw new Error("Unauthorized");
  }
  const subject = uid.slice(-10);
  if (!subject) {
    throw new Error("Unauthorized");
  }
  return subject;
}

async function fetchJsonWithTimeout(url: string, init: RequestInit, timeoutSeconds = DEFAULT_TIMEOUT_SECONDS): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutSeconds * 1000);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      cache: "no-store",
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(text || `${response.status} ${response.statusText}`);
    }
    return text ? JSON.parse(text) : {};
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(request: Request) {
  try {
    const subject = await getSubjectFromSession();
    const body = (await request.json()) as RemoteBridgeRequestBody;
    const action = body?.action;
    if (!action || !["agents", "server-info", "issue-token", "revoke-token"].includes(action)) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    if (action === "agents") {
      const response = (await fetchJsonWithTimeout(
        `${REMOTE_PROXY_BASE_URL}/manage/agents/details?subject=${encodeURIComponent(subject)}`,
        { method: "GET", headers: jsonHeaders() }
      )) as Record<string, unknown>;
      return NextResponse.json({ success: true, agents: Array.isArray(response?.agents) ? response.agents : [] });
    }

    if (action === "issue-token") {
      const expiryMinutes = Math.max(1, Math.min(1440, Number(body?.expiryMinutes) || 60));
      const response = await fetchJsonWithTimeout(`${REMOTE_PROXY_BASE_URL}/manage/jwt/issue`, {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({
          subject,
          expiry_minutes: expiryMinutes,
          capabilities: ["*"],
        }),
      });
      return NextResponse.json({ success: true, data: response });
    }

    if (action === "revoke-token") {
      const token = (body?.token || "").trim();
      if (!token) {
        return NextResponse.json({ error: "token is required" }, { status: 400 });
      }
      const response = await fetchJsonWithTimeout(`${REMOTE_PROXY_BASE_URL}/manage/jwt/revoke`, {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({ token }),
      });
      return NextResponse.json({ success: true, data: response });
    }

    const agentId = (body?.agentId || "").trim();
    const mcpServer = (body?.mcpServer || "").trim();
    if (!agentId || !mcpServer) {
      return NextResponse.json({ error: "agentId and mcpServer are required" }, { status: 400 });
    }
    const data = await fetchJsonWithTimeout(
      `${REMOTE_PROXY_BASE_URL}/manage/${encodeURIComponent(agentId)}/${encodeURIComponent(mcpServer)}/server-info?subject=${encodeURIComponent(subject)}`,
      { method: "POST", headers: jsonHeaders(), body: "{}" }
    );
    return NextResponse.json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    const status = message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

