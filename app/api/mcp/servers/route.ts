import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  SAVE_MCP_SERVER_MUTATION,
  REMOVE_MCP_SERVER_MUTATION,
  USER_MCP_SERVERS_QUERY,
} from "@/lib/graphql";
import { storeServerEmbeddings, deleteServerEmbeddings } from "@/lib/ai/embedding";

const GRAPHQL_ENDPOINT = (process.env.BACKEND_URL || "http://127.0.0.1:8000") + "/api/graphql";

// --- Helpers ---

async function getAuthenticatedSession() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return null;
  }

  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

async function callGraphQL(token: string, query: string, variables: Record<string, any>) {
  const response = await fetch(GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ query, variables }),
  });

  const contentType = response.headers.get("content-type");
  if (!contentType?.includes("application/json")) {
    throw new Error("Backend server returned invalid response format");
  }

  const result = await response.json();
  if (!response.ok || result.errors) {
    throw new Error(result.errors?.[0]?.message || "GraphQL Operation Failed");
  }

  return result.data;
}

async function handleEmbeddings(savedServer: any, userId: string) {
  try {
    const embeddingContent = [savedServer.name, savedServer.description].filter(Boolean).join(". ");

    await storeServerEmbeddings(
      savedServer.id,
      embeddingContent,
      {
        name: savedServer.name,
        url: savedServer.url,
        remoteUrl: savedServer.url,
        transport: savedServer.transport,
        description: savedServer.description,
      },
      userId
    );
  } catch (err) {
    console.error("Background Embedding Error:", err);
  }
}

async function resolveServerNameById(token: string, serverId: string): Promise<string | null> {
  const data = await callGraphQL(token, USER_MCP_SERVERS_QUERY, {});
  const servers = Array.isArray(data?.getUserMcpServers) ? data.getUserMcpServers : [];
  const match = servers.find((server: any) => String(server?.id) === serverId);
  const name = String(match?.name || "").trim();
  return name || null;
}

// --- Route Handlers ---

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthenticatedSession();
    if (!session?.access_token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();

    const variables = {
      ...body,
      headers: Object.keys(body.headers || {}).length > 0 ? body.headers : null,
      queryParams: Object.keys(body.queryParams || {}).length > 0 ? body.queryParams : null,
      requiresOauth2: body.requiresOauth,
      categoryIds: body.categoryIds || null,
    };

    const data = await callGraphQL(session.access_token, SAVE_MCP_SERVER_MUTATION, variables);
    const savedServer = data.saveMcpServer;

    if (savedServer?.id) {
      await handleEmbeddings(savedServer, session.user.id);
    }

    return NextResponse.json({ data: savedServer });
  } catch (error: any) {
    console.error("Error saving MCP server:", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getAuthenticatedSession();
    if (!session?.access_token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const serverId = request.nextUrl.searchParams.get("id")?.trim() || "";
    let serverName = request.nextUrl.searchParams.get("name")?.trim() || "";

    if (!serverName && !serverId) {
      return NextResponse.json({ error: "Server id or name is required" }, { status: 400 });
    }

    if (!serverName && serverId) {
      const resolvedName = await resolveServerNameById(session.access_token, serverId);
      if (!resolvedName) {
        return NextResponse.json({ error: "Server not found for given id" }, { status: 404 });
      }
      serverName = resolvedName;
    }

    const data = await callGraphQL(session.access_token, REMOVE_MCP_SERVER_MUTATION, { serverName });
    if (data.removeMcpServer) {
      await deleteServerEmbeddings({ serverName });
    }

    return NextResponse.json({ data: data.removeMcpServer });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}
