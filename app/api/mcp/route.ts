import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listMcpServersCatalog } from "@/lib/mcp-servers/service";
import { restMcpServer } from "@/lib/mcp-servers/rest-serialize";

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
 * With default `public=true` (or omitted), anonymous clients may read the public catalog (RLS: is_public rows).
 * With `public=false`, requires a signed-in user (RLS returns own + public rows).
 *
 * Query: first, after, orderBy (-createdAt | name | -name | …), categorySlug, search (name only),
 * `featured=true|false`, `public=true|false` (booleans as strings; default public=true, featured=false).
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const publicOnly = parseQueryBoolean(searchParams, "public", true);

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

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
