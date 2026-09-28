import { client } from "@mcp-ts/client";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ serverId: string }>;
};

/**
 * POST /api/servers/:serverId/oauth
 * Generates an OAuth 2.1 authorization URL for the specified MCP server.
 */
export async function POST(req: Request, context: RouteContext) {
  try {
    const { serverId } = await context.params;
    const body = await req.json().catch(() => ({}));
    const userId = body.userId || process.env.NEXT_PUBLIC_MCP_USER_ID || "demo-user-123";
    const callbackUrl = body.callbackUrl || undefined;
    const clientMetadataUrl = body.clientMetadataUrl || undefined;

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
