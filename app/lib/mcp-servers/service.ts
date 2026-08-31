import type { SupabaseClient } from "@supabase/supabase-js";
import { decodeOffsetCursor, encodeOffsetCursor } from "./cursor";
import { mapServerRow, normalizeHeaderRecord, type CategoryRow, type McpServerRow, type McpServersConnection, type McpServerNode } from "./types";

export const SERVER_SELECT = `
  *,
  mcp_server_categories (
    category_id,
    category:categories (
      id,
      name,
      slug,
      icon,
      color,
      description,
      created_at,
      updated_at
    )
  )
`;

function escapeIlike(q: string): string {
  return q.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

export async function listCategories(supabase: SupabaseClient): Promise<CategoryRow[]> {
  const { data, error } = await supabase
    .from("categories")
    .select("id,name,slug,icon,color,description,created_at,updated_at")
    .order("name", { ascending: true });

  if (error) throw new Error(error.message);
  return (data || []) as CategoryRow[];
}

export async function listUserMcpServers(supabase: SupabaseClient, userId: string): Promise<McpServerNode[]> {
  const { data, error } = await supabase
    .from("mcp_servers")
    .select(SERVER_SELECT)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

  if (error) throw new Error(error.message);
  return ((data || []) as McpServerRow[]).map(mapServerRow);
}

type ListCatalogOpts = {
  first: number;
  after?: string | null;
  orderField?: "created_at" | "updated_at" | "name";
  orderAscending?: boolean;
  categorySlug?: string | null;
  search?: string | null;
  /**
   * When true, `search` matches `name` OR `description` (case-insensitive).
   * Default false: name only (MCP UI catalog search).
   */
  searchInDescription?: boolean;
  featuredOnly?: boolean;
  /** When true, only is_public servers (default for catalog browsing). */
  publicOnly?: boolean;
};

export async function listMcpServersCatalog(
  supabase: SupabaseClient,
  opts: ListCatalogOpts
): Promise<McpServersConnection> {
  const first = Math.min(Math.max(opts.first || 10, 1), 100);
  const offset = decodeOffsetCursor(opts.after);
  const publicOnly = opts.publicOnly !== false;
  const field = opts.orderField ?? "created_at";
  const ascending = opts.orderAscending ?? false;

  let categoryIds: string[] | null = null;
  if (opts.categorySlug) {
    const { data: cat, error: catErr } = await supabase
      .from("categories")
      .select("id")
      .eq("slug", opts.categorySlug)
      .maybeSingle();
    if (catErr) throw new Error(catErr.message);
    if (!cat?.id) {
      return emptyConnection(first, offset);
    }
    const { data: links, error: linkErr } = await supabase
      .from("mcp_server_categories")
      .select("mcp_server_id")
      .eq("category_id", cat.id);
    if (linkErr) throw new Error(linkErr.message);
    categoryIds = [...new Set((links || []).map((l: { mcp_server_id: string }) => l.mcp_server_id))];
    if (categoryIds.length === 0) {
      return emptyConnection(first, offset);
    }
  }

  let q = supabase.from("mcp_servers").select(SERVER_SELECT, { count: "exact" });

  if (publicOnly) {
    q = q.eq("is_public", true);
  }
  if (opts.featuredOnly) {
    q = q.eq("is_featured", true);
  }
  if (categoryIds) {
    q = q.in("id", categoryIds);
  }
  if (opts.search?.trim()) {
    const pat = `%${escapeIlike(opts.search.trim())}%`;
    if (opts.searchInDescription) {
      q = q.or(`name.ilike.${pat},description.ilike.${pat}`);
    } else {
      q = q.ilike("name", pat);
    }
  }

  q = q.order(field, { ascending }).order("id", { ascending });

  const from = offset;
  const to = offset + first - 1;
  const { data, error, count } = await q.range(from, to);

  if (error) throw new Error(error.message);

  const rows = (data || []) as McpServerRow[];
  const totalCount = count ?? rows.length;
  const hasNextPage = offset + first < totalCount;
  const edges = rows.map((row, i) => ({
    node: mapServerRow(row),
    cursor: encodeOffsetCursor(offset + i),
  }));
  const nextOffset = offset + first;

  return {
    totalCount,
    edges,
    pageInfo: {
      hasNextPage,
      hasPreviousPage: offset > 0,
      startCursor: edges[0] ? edges[0].cursor : null,
      endCursor: hasNextPage ? encodeOffsetCursor(nextOffset) : null,
    },
  };
}

function emptyConnection(first: number, offset: number): McpServersConnection {
  return {
    totalCount: 0,
    edges: [],
    pageInfo: {
      hasNextPage: false,
      hasPreviousPage: offset > 0,
      startCursor: null,
      endCursor: null,
    },
  };
}

export async function saveUserMcpServer(
  supabase: SupabaseClient,
  userId: string,
  body: Record<string, unknown>
): Promise<McpServerNode> {
  const name = String(body.name || "").trim();
  if (!name) throw new Error("Server name is required");

  const transport = String(body.transport || "streamable-http").trim();
  const row = {
    name,
    description: (body.description as string) || null,
    transport,
    url: (body.url as string) || null,
    icon: (body.icon as string) || null,
    is_verified: Boolean(body.isVerified ?? body.is_verified),
    headers: normalizeHeaderRecord(body.headers) ?? null,
    query_params: body.queryParams ?? null,
    requires_oauth2: Boolean(body.requiresOauth2 ?? body.requiresOauth),
    client_id: (body.clientId as string) || null,
    client_secret: (body.clientSecret as string) || null,
    is_public: Boolean(body.isPublic),
  };

  const categoryIds = Array.isArray(body.categoryIds)
    ? (body.categoryIds as string[]).filter(Boolean)
    : [];

  const id = body.id ? String(body.id) : null;
  let serverId: string;

  if (id) {
    const { data: existing, error: exErr } = await supabase
      .from("mcp_servers")
      .select("id,user_id")
      .eq("id", id)
      .maybeSingle();
    if (exErr) throw new Error(exErr.message);
    if (!existing || existing.user_id !== userId) {
      throw new Error("Server not found or access denied");
    }

    const { error: upErr } = await supabase
      .from("mcp_servers")
      .update(row)
      .eq("id", id)
      .eq("user_id", userId);

    if (upErr) throw new Error(upErr.message);
    serverId = id;
    await replaceServerCategories(supabase, serverId, categoryIds);
  } else {
    const { data: inserted, error: insErr } = await supabase
      .from("mcp_servers")
      .insert({
        ...row,
        user_id: userId,
      })
      .select("id")
      .single();

    if (insErr) throw new Error(insErr.message);
    serverId = inserted.id;
    await replaceServerCategories(supabase, serverId, categoryIds);
  }

  const { data: full, error: readErr } = await supabase
    .from("mcp_servers")
    .select(SERVER_SELECT)
    .eq("id", serverId)
    .single();

  if (readErr) throw new Error(readErr.message);
  return mapServerRow(full as McpServerRow);
}

async function replaceServerCategories(
  supabase: SupabaseClient,
  serverId: string,
  categoryIds: string[]
) {
  const { error: delErr } = await supabase.from("mcp_server_categories").delete().eq("mcp_server_id", serverId);
  if (delErr) throw new Error(delErr.message);

  if (categoryIds.length === 0) return;

  const rows = categoryIds.map((category_id) => ({ mcp_server_id: serverId, category_id }));
  const { error: insErr } = await supabase.from("mcp_server_categories").insert(rows);
  if (insErr) throw new Error(insErr.message);
}

export async function deleteUserMcpServer(
  supabase: SupabaseClient,
  userId: string,
  opts: { id?: string; name?: string }
): Promise<boolean> {
  let q = supabase.from("mcp_servers").delete().eq("user_id", userId);
  if (opts.id) {
    q = q.eq("id", opts.id);
  } else if (opts.name) {
    q = q.eq("name", opts.name);
  } else {
    throw new Error("id or name required");
  }

  const { data, error } = await q.select("id");
  if (error) throw new Error(error.message);
  return (data?.length ?? 0) > 0;
}

export async function getUserServerNameById(
  supabase: SupabaseClient,
  userId: string,
  serverId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from("mcp_servers")
    .select("name")
    .eq("user_id", userId)
    .eq("id", serverId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.name ? String(data.name) : null;
}
