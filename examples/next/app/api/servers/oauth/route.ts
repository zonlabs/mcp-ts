import { client } from "@mcp-ts/client";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/servers/oauth
 * Body: { serverId, userId?, callbackUrl? }
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const userId = body.userId || process.env.NEXT_PUBLIC_MCP_USER_ID || "demo-user-123";
    const serverId = body.serverId || body.id;
    const callbackUrl = body.callbackUrl || undefined;
    const clientMetadataUrl = body.clientMetadataUrl || undefined;

    if (!serverId) {
      return NextResponse.json({ error: "serverId is required" }, { status: 400 });
    }

    const res = await client.mcpServers.createOAuthAuthorizationUrl({
      userId,
      serverId,
      callbackUrl,
      clientMetadataUrl,
    });

    return NextResponse.json(res);
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to generate OAuth authorization URL" },
      { status: 500 }
    );
  }
}
