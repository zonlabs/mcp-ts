-- MCP server catalog stored in Supabase (replaces external GraphQL backend).
-- Apply via Supabase CLI or SQL Editor.

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  icon text,
  color text,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.mcp_servers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  description text,
  transport text not null default 'streamable_http',
  url text,
  icon text,
  is_verified boolean not null default false,
  headers jsonb,
  query_params jsonb,
  requires_oauth2 boolean not null default false,
  is_public boolean not null default false,
  is_featured boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create table if not exists public.mcp_server_categories (
  mcp_server_id uuid not null references public.mcp_servers (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete cascade,
  primary key (mcp_server_id, category_id)
);

create index if not exists mcp_servers_user_id_idx on public.mcp_servers (user_id);
create index if not exists mcp_servers_is_public_created_idx on public.mcp_servers (is_public, created_at desc);
create index if not exists mcp_servers_featured_idx on public.mcp_servers (is_featured) where is_featured = true;

create or replace function public.mcp_servers_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists mcp_servers_set_updated_at on public.mcp_servers;
create trigger mcp_servers_set_updated_at
  before update on public.mcp_servers
  for each row execute function public.mcp_servers_set_updated_at();

drop trigger if exists categories_set_updated_at on public.categories;
create trigger categories_set_updated_at
  before update on public.categories
  for each row execute function public.mcp_servers_set_updated_at();

alter table public.categories enable row level security;
alter table public.mcp_servers enable row level security;
alter table public.mcp_server_categories enable row level security;

drop policy if exists "categories_select_authenticated" on public.categories;
create policy "categories_select_authenticated"
  on public.categories for select to authenticated using (true);

drop policy if exists "categories_select_anon" on public.categories;
create policy "categories_select_anon"
  on public.categories for select to anon using (true);

drop policy if exists "mcp_servers_select_authenticated" on public.mcp_servers;
create policy "mcp_servers_select_authenticated"
  on public.mcp_servers for select to authenticated
  using (user_id = (select auth.uid()) or is_public = true);

drop policy if exists "mcp_servers_select_anon_public" on public.mcp_servers;
create policy "mcp_servers_select_anon_public"
  on public.mcp_servers for select to anon using (is_public = true);

drop policy if exists "mcp_servers_insert_own" on public.mcp_servers;
create policy "mcp_servers_insert_own"
  on public.mcp_servers for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "mcp_servers_update_own" on public.mcp_servers;
create policy "mcp_servers_update_own"
  on public.mcp_servers for update to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "mcp_servers_delete_own" on public.mcp_servers;
create policy "mcp_servers_delete_own"
  on public.mcp_servers for delete to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "msc_select_authenticated" on public.mcp_server_categories;
create policy "msc_select_authenticated"
  on public.mcp_server_categories for select to authenticated
  using (
    exists (
      select 1 from public.mcp_servers s
      where s.id = mcp_server_id
        and (s.user_id = (select auth.uid()) or s.is_public = true)
    )
  );

drop policy if exists "msc_select_anon" on public.mcp_server_categories;
create policy "msc_select_anon"
  on public.mcp_server_categories for select to anon
  using (
    exists (
      select 1 from public.mcp_servers s
      where s.id = mcp_server_id and s.is_public = true
    )
  );

drop policy if exists "msc_insert_own" on public.mcp_server_categories;
create policy "msc_insert_own"
  on public.mcp_server_categories for insert to authenticated
  with check (
    exists (
      select 1 from public.mcp_servers s
      where s.id = mcp_server_id and s.user_id = (select auth.uid())
    )
  );

drop policy if exists "msc_delete_own" on public.mcp_server_categories;
create policy "msc_delete_own"
  on public.mcp_server_categories for delete to authenticated
  using (
    exists (
      select 1 from public.mcp_servers s
      where s.id = mcp_server_id and s.user_id = (select auth.uid())
    )
  );

insert into public.categories (name, slug, description)
values
  ('Database', 'database', 'Databases and storage'),
  ('Search', 'search', 'Search and retrieval'),
  ('Dev tools', 'dev-tools', 'Developer tools'),
  ('Communication', 'communication', 'Email, chat, notifications')
on conflict (slug) do nothing;
