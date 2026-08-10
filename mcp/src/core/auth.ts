import type { IncomingHttpHeaders } from "node:http";
import { supabase } from "../db/supabase";

/**
 * Extracts a Bearer token from the incoming HTTP headers.
 */
function extractBearerToken(headers: IncomingHttpHeaders): string | null {
  const authHeader = headers["authorization"];
  if (typeof authHeader !== "string") return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1]?.trim() || null : null;
}

/**
 * Resolves the underlying userId and active scopes from an access token or Supabase JWT.
 */
async function getUserIdAndScopesFromToken(
  token: string
): Promise<{ userId: string; scopes: string[] } | null> {
  const { data, error } = await supabase.auth.getUser(token);
  return error || !data?.user?.id
    ? null
    : {
        userId: data.user.id,
        scopes: ["openid", "email", "profile", "mcp:tools:read", "mcp:tools:execute"],
      };
}

/**
 * Resolves user credentials and scopes, automatically appending admin privileges for staff.
 */
export async function resolveCredentialAndScopes(
  token: string
): Promise<{ userId: string; scopes: string[] } | null> {
  const t = token.trim();
  if (!t) return null;

  const result = await getUserIdAndScopesFromToken(t);
  if (!result) return null;

  const { userId, scopes } = result;
  const { data: roleData } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();

  if (roleData?.role === "staff" && !scopes.includes("mcp:tools:admin")) {
    scopes.push("mcp:tools:admin");
  }

  return { userId, scopes };
}

/**
 * Returns the Supabase user ID and active scopes for an incoming HTTP request.
 */
export async function resolveUserAndScopesFromRequest(req: {
  headers: IncomingHttpHeaders;
}): Promise<{ userId: string; scopes: string[] } | null> {
  const token = extractBearerToken(req.headers);
  return token ? resolveCredentialAndScopes(token) : null;
}


