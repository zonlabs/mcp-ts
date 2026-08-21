import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listMcpServersCatalog, SERVER_SELECT } from "@/lib/mcp-servers/service";
import { restMcpServer } from "@/lib/mcp-servers/rest-serialize";
import { mapServerRow } from "@/lib/mcp-servers/types";

/** `?key=true` / `?key=false` only; missing or invalid → defaultValue. */
function parseQueryBoolean(
  searchParams: URLSearchParams,
  key: string,
  defaultValue: boolean
): boolean {
  const raw = searchParams.get(key);
  if (raw === null || raw === "") return defaultValue;
  const v = raw.trim().toLowerCase();
  if (v === "true") return true;
  if (v === "false") return false;
  return defaultValue;
}

function parseOrderBy(orderBy: string | null): {
  orderField: "created_at" | "updated_at" | "name";
  orderAscending: boolean;
} {
  if (!orderBy) return { orderField: "created_at", orderAscending: false };
  const desc = orderBy.startsWith("-");
  const key = desc ? orderBy.slice(1) : orderBy;
  const orderField =
    key === "name"
      ? "name"
      : key === "updatedAt" || key === "updated_at"
        ? "updated_at"
        : "created_at";
  return { orderField, orderAscending: !desc };
}

/**
 * GET /api/mcp — MCP catalog (REST).
 *
 * Supports querying a single server by ?id=<uuid>
 * Or querying list with first, after, orderBy, categorySlug, search, etc.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const publicOnly = parseQueryBoolean(searchParams, "public", true);

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  // If specific server id is requested
  const serverId = searchParams.get("id");
  if (serverId) {
    const { data: row, error } = await supabase
      .from("mcp_servers")
      .select(SERVER_SELECT)
      .eq("id", serverId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!row) {
      return NextResponse.json({ error: "Server not found" }, { status: 404 });
    }
    const node = mapServerRow(row);
    const server = restMcpServer(node, {
      includeHeaders: true,
      includeCredentials: user ? node.owner === user.id : false,
    });
    return NextResponse.json({ server });
  }

  // Public catalog (default public=true): allow anonymous reads; RLS limits rows to is_public.
  // public=false requires auth (RLS still restricts rows for that user).
  if (!publicOnly && (authError || !user)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const first = searchParams.get("first") ? parseInt(searchParams.get("first")!, 10) : 10;
  const after = searchParams.get("after") || undefined;
  const orderBy = searchParams.get("orderBy");
  const categorySlug = searchParams.get("categorySlug") || undefined;
  const search = searchParams.get("search") || undefined;
  const featured = parseQueryBoolean(searchParams, "featured", false);

  const { orderField, orderAscending } = parseOrderBy(orderBy);

  try {
    const conn = await listMcpServersCatalog(supabase, {
      first,
      after,
      orderField,
      orderAscending,
      categorySlug,
      search,
      featuredOnly: featured,
      publicOnly,
    });

    const servers = conn.edges.map((e) => restMcpServer(e.node));

    return NextResponse.json({
      servers,
      totalCount: conn.totalCount,
      pageInfo: {
        hasNextPage: conn.pageInfo.hasNextPage,
        hasPreviousPage: conn.pageInfo.hasPreviousPage,
        endCursor: conn.pageInfo.endCursor,
      },
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to load servers";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
