import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listMcpServersCatalog } from "@/lib/mcp-servers/service";
import { restMcpServer } from "@/lib/mcp-servers/rest-serialize";

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
 * GET /api/mcp — public MCP catalog (REST).
 *
 * Query: first, after, orderBy (-createdAt | name | -name | …), categorySlug, search,
 * featured=1, public=1 (default: list only is_public rows).
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const first = searchParams.get("first") ? parseInt(searchParams.get("first")!, 10) : 10;
  const after = searchParams.get("after") || undefined;
  const orderBy = searchParams.get("orderBy");
  const categorySlug = searchParams.get("categorySlug") || undefined;
  const search = searchParams.get("search") || undefined;
  const featured = searchParams.get("featured") === "1" || searchParams.get("featured") === "true";
  const publicOnly =
    searchParams.get("public") === "0" || searchParams.get("public") === "false" ? false : true;

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
