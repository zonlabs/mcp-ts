import { client } from "@mcp-ts/client";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/servers
 * Query params:
 *   - userId (optional, defaults to demo-user-123)
 *   - enabled (optional, 'true' | 'false')
 *   - search (optional, search term)
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId") || process.env.NEXT_PUBLIC_MCP_USER_ID || "demo-user-123";
    const enabledParam = searchParams.get("enabled");
    const enabled = enabledParam !== null ? enabledParam === "true" : undefined;
    const search = searchParams.get("search") || undefined;

    const result = await client.mcpServers.find({
      userId,
      enabled,
      search,
    });

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to retrieve MCP servers" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/servers
 * Body: { name, url, description?, enabled?, auth?, metadata?, serverId?, userId? }
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const userId = body.userId || process.env.NEXT_PUBLIC_MCP_USER_ID || "demo-user-123";

    if (!body.name || !body.url) {
      return NextResponse.json(
        { error: "Both 'name' and 'url' are required" },
        { status: 400 }
      );
    }

    const server = await client.mcpServers.create({
      ...body,
      userId,
    });

    return NextResponse.json(server, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to create MCP server" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/servers
 * Body: { serverId, userId?, enabled?, ... }
 */
export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const userId = body.userId || process.env.NEXT_PUBLIC_MCP_USER_ID || "demo-user-123";
    const serverId = body.serverId || body.id;

    if (!serverId) {
      return NextResponse.json({ error: "serverId is required" }, { status: 400 });
    }

    const updated = await client.mcpServers.update({
      ...body,
      userId,
      serverId,
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to update MCP server" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/servers?serverId=:serverId&userId=:userId
 */
export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const serverId = searchParams.get("serverId") || searchParams.get("id");
    const userId = searchParams.get("userId") || process.env.NEXT_PUBLIC_MCP_USER_ID || "demo-user-123";

    if (!serverId) {
      return NextResponse.json({ error: "serverId is required" }, { status: 400 });
    }

    const result = await client.mcpServers.delete({ userId, serverId });
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to delete MCP server" },
      { status: 500 }
    );
  }
}

