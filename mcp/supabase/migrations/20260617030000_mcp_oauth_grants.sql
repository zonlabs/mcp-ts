create table if not exists public.mcp_oauth_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id text not null,
  client_name text,
  redirect_uri text not null,
  scope text not null default 'mcp:tools:read',
  token_hash text not null,
  token_prefix text not null,
  created_at timestamptz default now(),
  expires_at timestamptz,
  last_used_at timestamptz,
  revoked_at timestamptz
);

create unique index if not exists idx_mcp_oauth_grants_hash_active
  on public.mcp_oauth_grants (token_hash)
  where revoked_at is null;

create index if not exists idx_mcp_oauth_grants_user_created
  on public.mcp_oauth_grants (user_id, created_at desc);

alter table public.mcp_oauth_grants enable row level security;

drop policy if exists "mcp_oauth_grants_select_own" on public.mcp_oauth_grants;
drop policy if exists "mcp_oauth_grants_update_own" on public.mcp_oauth_grants;

create policy "mcp_oauth_grants_select_own"
  on public.mcp_oauth_grants for select
  using (auth.uid() = user_id);

create policy "mcp_oauth_grants_update_own"
  on public.mcp_oauth_grants for update
  using (auth.uid() = user_id);

comment on table public.mcp_oauth_grants is
  'Revocable MCP OAuth access grants issued by MCP Assistant - MCP Server.';
