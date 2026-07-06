import type { Category } from "@/types/mcp";

export type CategoryRow = {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  color: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
};

export type McpServerRow = {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  transport: string;
  url: string | null;
  icon: string | null;
  is_verified: boolean;
  headers: unknown;
  query_params: unknown;
  requires_oauth2: boolean;
  client_id?: string | null;
  client_secret?: string | null;
  is_public: boolean;
  is_featured: boolean;
  created_at: string;
  updated_at: string;
  mcp_server_categories?: Array<{
    category_id: string;
    category: CategoryRow | null;
  }> | null;
};

export type McpServerNode = {
  id: string;
  name: string;
  transport: string;
  url: string | null;
  icon: string | null;
  headers?: Record<string, string>;
  isVerified: boolean;
  categories: Category[];
  description: string | null;
  requiresOauth2: boolean;
  clientId?: string | null;
  clientSecret?: string | null;
  updatedAt: string;
  createdAt: string;
  owner: string;
  isPublic: boolean;
  tools: [];
};

export type McpServersConnection = {
  totalCount: number;
  edges: Array<{ node: McpServerNode; cursor: string }>;
  pageInfo: {
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    startCursor: string | null;
    endCursor: string | null;
  };
};

export function normalizeHeaderRecord(headers: unknown): Record<string, string> | undefined {
  if (!headers || typeof headers !== "object") return undefined;

  const entries = Array.isArray(headers)
    ? headers.map((header) => {
      if (!header || typeof header !== "object") return ["", ""] as const;
      const { key, value } = header as { key?: unknown; value?: unknown };
      return [String(key ?? "").trim(), String(value ?? "").trim()] as const;
    })
    : Object.entries(headers as Record<string, unknown>)
      .map(([key, value]) => [key.trim(), String(value ?? "").trim()] as const);

  const normalized = entries.filter(([key, value]) => key.length > 0 && value.length > 0);
  return normalized.length > 0 ? Object.fromEntries(normalized) : undefined;
}

export function mapCategoryRow(row: CategoryRow): Category {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    icon: row.icon,
    color: row.color,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapServerRow(row: McpServerRow): McpServerNode {
  const categories: Category[] = (row.mcp_server_categories || [])
    .map((j) => j.category)
    .filter(Boolean)
    .map((c) => mapCategoryRow(c as CategoryRow));

  return {
    id: row.id,
    name: row.name,
    transport: row.transport,
    url: row.url,
    icon: row.icon ?? null,
    headers: normalizeHeaderRecord(row.headers),
    isVerified: row.is_verified ?? false,
    categories,
    description: row.description,
    requiresOauth2: row.requires_oauth2,
    clientId: row.client_id ?? null,
    clientSecret: row.client_secret ?? null,
    updatedAt: row.updated_at,
    createdAt: row.created_at,
    owner: row.user_id,
    isPublic: row.is_public,
    tools: [],
  };
}
