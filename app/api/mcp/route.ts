import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { MCP_SERVERS_QUERY } from "@/lib/graphql";

/**
 * GET /api/mcp - Fetch MCP servers with optional pagination and ordering
 *
 * Query Parameters (Cursor-based pagination):
 * - first: Number of servers to return (default: 10, e.g., ?first=10)
 * - after: Cursor for pagination (e.g., ?after=cursor_string)
 * - orderBy: Field to order by with optional "-" prefix for descending (e.g., ?orderBy=-createdAt)
 *   Supported fields: name, createdAt, updatedAt
 *
 * Examples:
 * - /api/mcp - Get first 10 servers (default)
 * - /api/mcp?first=10&after=cursor123 - Get next 10 servers after cursor
 * - /api/mcp?orderBy=-createdAt&first=10 - Get 10 newest servers
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  // Parse query parameters for cursor-based pagination
  const { searchParams } = new URL(request.url);
  const first = searchParams.get("first") ? parseInt(searchParams.get("first")!) : 10; // Default 10 items
  const after = searchParams.get("after") || undefined;
  const orderBy = searchParams.get("orderBy") || undefined;

  const origin = (process.env.DJANGO_API_URL || process.env.BACKEND_URL)?.replace(/\/$/, "");
  if (!origin) {
    return NextResponse.json(
      { errors: [{ message: "Server misconfigured" }] },
      { status: 500 }
    );
  }

  const headers: Record<string, string> = {
    "content-type": "application/json",
  };

  // Only add authorization header if token is available
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }

  // Build variables object for cursor-based pagination
  const variables: { first: number; after?: string; order?: Record<string, string> } = {
    first,
  };

  if (after) {
    variables.after = after;
  }

  if (orderBy) {
    // Parse orderBy format: "name", "-name", "createdAt", "-createdAt"
    const isDesc = orderBy.startsWith("-");
    const field = isDesc ? orderBy.substring(1) : orderBy;
    variables.order = {
      [field]: isDesc ? "DESC" : "ASC"
    };
  }

  const resp = await fetch(`${origin}/api/graphql`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      query: MCP_SERVERS_QUERY,
      variables
    }),
    cache: "no-store",
  });

  const data = await resp.text();
  return new NextResponse(data, {
    status: resp.status,
    headers: { "content-type": "application/json" }
  });
}


