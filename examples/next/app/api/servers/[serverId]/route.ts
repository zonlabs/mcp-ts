import { client } from "@mcp-ts/client";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ serverId: string }>;
};

/**
 * GET /api/servers/:serverId
 */
export async function GET(req: Request, context: RouteContext) {
  try {
    const { serverId } = await context.params;
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId") || process.env.NEXT_PUBLIC_MCP_USER_ID || "demo-user-123";

    const server = await client.mcpServers.getById({ userId, serverId });
    if (!server) {
      return NextResponse.json({ error: "MCP server not found" }, { status: 404 });
    }

    return NextResponse.json(server);
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to retrieve MCP server" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/servers/:serverId
 */
export async function PATCH(req: Request, context: RouteContext) {
  try {
    const { serverId } = await context.params;
    const body = await req.json();
    const userId = body.userId || process.env.NEXT_PUBLIC_MCP_USER_ID || "demo-user-123";

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
 * DELETE /api/servers/:serverId
 */
export async function DELETE(req: Request, context: RouteContext) {
  try {
    const { serverId } = await context.params;
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId") || process.env.NEXT_PUBLIC_MCP_USER_ID || "demo-user-123";

    const result = await client.mcpServers.delete({ userId, serverId });
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to delete MCP server" },
      { status: 500 }
    );
  }
}
