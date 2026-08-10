-- OAuth 2.0 dynamic client registration (MCP desktop hosts: Cursor, VS Code, etc.)
-- Access: server only via SUPABASE_SERVICE_ROLE_KEY (RLS blocks anon/authenticated API keys).

create table if not exists public.oauth_dynamic_clients (
  client_id text primary key,
  redirect_uris jsonb not null,
  created_at timestamptz not null default now(),
  client_name text,
  logo_uri text
);

create index if not exists oauth_dynamic_clients_created_at_idx
  on public.oauth_dynamic_clients (created_at desc);

comment on table public.oauth_dynamic_clients is 'MCP OAuth dynamic registration: client_id, redirect_uris, display metadata.';

alter table public.oauth_dynamic_clients enable row level security;

-- RLS: explicit deny for anon + authenticated PostgREST roles (publishable/anon key & user JWT).
-- Supabase service_role bypasses RLS — server-side registry uses the service role only.
create policy "oauth_dynamic_clients_block_anon"
  on public.oauth_dynamic_clients
  for all
  to anon
  using (false)
  with check (false);

create policy "oauth_dynamic_clients_block_authenticated"
  on public.oauth_dynamic_clients
  for all
  to authenticated
  using (false)
  with check (false);
