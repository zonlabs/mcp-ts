import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getBridgeSubjectFromUserId,
  getRemoteAgents,
  getRemoteServerInfo,
  requireRemoteProxyBaseUrl,
  invokeRemoteServer,
} from "@/lib/remote-bridge";

type Action = "agents" | "server-info" | "issue-token" | "revoke-token" | "invoke";

interface RemoteBridgeRequestBody {
  action: Action;
  agentId?: string;
  mcpServer?: string;
  agent_id?: string;
  mcp_server?: string;
  expiryMinutes?: number;
  token?: string;
  payload?: unknown;
}

function jsonHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

async function getSubjectFromSession(): Promise<string> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Unauthorized");
  }
  return getBridgeSubjectFromUserId(user.id);
}

export async function POST(request: Request) {
  try {
    const subject = await getSubjectFromSession();
    const body = (await request.json()) as RemoteBridgeRequestBody;
    const action = body?.action;
    if (!action || !["agents", "server-info", "issue-token", "revoke-token", "invoke"].includes(action)) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    // For calls that hit the gateway directly, fail fast with a friendly status code.
    if (action === "issue-token" || action === "revoke-token") {
      requireRemoteProxyBaseUrl();
    }

    if (action === "agents") {
      const agents = await getRemoteAgents(subject);
      return NextResponse.json({ success: true, agents });
    }

    if (action === "issue-token") {
      const expiryMinutes = Math.max(1, Math.min(1440, Number(body?.expiryMinutes) || 60));
      const baseUrl = requireRemoteProxyBaseUrl();
      const response = await fetch(`${baseUrl}/manage/jwt/issue`, {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({
          subject,
          expiry_minutes: expiryMinutes,
          capabilities: ["*"],
        }),
      });
      const text = await response.text();
      if (!response.ok) {
        throw new Error(text || `${response.status} ${response.statusText}`);
      }
      return NextResponse.json({ success: true, data: text ? JSON.parse(text) : {} });
    }

    if (action === "revoke-token") {
      const token = (body?.token || "").trim();
      if (!token) {
        return NextResponse.json({ error: "token is required" }, { status: 400 });
      }
      const baseUrl = requireRemoteProxyBaseUrl();
      const response = await fetch(`${baseUrl}/manage/jwt/revoke`, {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({ token }),
      });
      const text = await response.text();
      if (!response.ok) {
        throw new Error(text || `${response.status} ${response.statusText}`);
      }
      return NextResponse.json({ success: true, data: text ? JSON.parse(text) : {} });
    }

    const agentId = String(body?.agentId ?? body?.agent_id ?? "").trim();
    const mcpServer = String(body?.mcpServer ?? body?.mcp_server ?? "").trim();
    if (!agentId || !mcpServer) {
      return NextResponse.json({ error: "agentId and mcpServer are required" }, { status: 400 });
    }
    if (action === "invoke") {
      const payload = body?.payload ?? {};
      const data = await invokeRemoteServer(agentId, mcpServer, payload);
      return NextResponse.json({ success: true, data });
    }
    const data = await getRemoteServerInfo(subject, agentId, mcpServer);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    const status = message === "Unauthorized" ? 401 : message.includes("REMOTE_PROXY_BASE_URL") ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

