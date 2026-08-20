import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export interface NormalizedGrant {
  id: string;
  client: {
    id: string;
    name: string;
    uri?: string | null;
    logo_uri?: string | null;
  };
  scopes: string[];
  granted_at: string;
}

/**
 * GET /api/mcp-oauth/grants
 * Lists all active OAuth grants (clients that have connected to this user's MCP endpoint).
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { data, error } = await supabase.auth.oauth.listGrants();
    if (error) throw error;

    const rawList = Array.isArray(data) ? data : (data as any)?.grants ?? [];
    const grants: NormalizedGrant[] = rawList.map((g: any) => {
      const clientObj = g.client || {};
      const clientId = clientObj.id || g.client_id || g.id || "unknown";
      const clientName = clientObj.name || g.client_name || "MCP Client";
      const logoUri = clientObj.logo_uri || g.logo_uri || clientObj.logo || null;
      const clientUri = clientObj.uri || g.client_uri || null;
      const grantedAt = g.granted_at || g.created_at || new Date().toISOString();
      const scopes = Array.isArray(g.scopes)
        ? g.scopes
        : typeof g.scope === "string"
        ? g.scope.split(/\s+/).filter(Boolean)
        : [];

      return {
        id: clientId,
        client: {
          id: clientId,
          name: clientName,
          uri: clientUri,
          logo_uri: logoUri,
        },
        scopes,
        granted_at: grantedAt,
      };
    });

    return NextResponse.json({ grants });
  } catch (err: any) {
    console.error("Failed to list OAuth grants:", err);
    return NextResponse.json({ grants: [] });
  }
}
