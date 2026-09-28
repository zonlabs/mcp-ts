import { client } from "@mcp-ts/client";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/servers/tools?serverId=:serverId&userId=:userId
 * Retrieves the tools exposed by the specified MCP server.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const serverId = searchParams.get("serverId") || searchParams.get("id");
    const userId = searchParams.get("userId") || process.env.NEXT_PUBLIC_MCP_USER_ID || "demo-user-123";

    if (!serverId) {
      return NextResponse.json({ error: "serverId is required" }, { status: 400 });
    }

    const result = await client.mcpServers.listTools({ userId, serverId });
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to list tools from MCP server" },
      { status: 500 }
    );
  }
}
