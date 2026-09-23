-- Migration: 20260924_create_chat_shares.sql
-- Description: Create chat_shares and project_shares tables with SECURITY DEFINER helper functions to prevent RLS recursion (42P17)

-- 1. Helper functions with SECURITY DEFINER (avoids mutual RLS recursion between chats and chat_shares)
create or replace function public.is_chat_owner(p_chat_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.chats
    where id = p_chat_id and user_id = p_user_id
  );
$$;

create or replace function public.is_chat_collaborator(p_chat_id uuid, p_email text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.chat_shares
    where chat_id = p_chat_id and lower(email) = lower(p_email)
  );
$$;

create or replace function public.is_chat_editor(p_chat_id uuid, p_email text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.chat_shares
    where chat_id = p_chat_id
      and lower(email) = lower(p_email)
      and role = 'editor'
  );
$$;

create or replace function public.is_project_owner(p_project_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.projects
    where id = p_project_id and user_id = p_user_id
  );
$$;

create or replace function public.is_project_collaborator(p_project_id uuid, p_email text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.project_shares
    where project_id = p_project_id and lower(email) = lower(p_email)
  );
$$;

-- 2. Create chat_shares table
create table if not exists public.chat_shares (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.chats(id) on delete cascade,
  email text not null,
  role text not null default 'viewer' check (role in ('viewer', 'editor')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (chat_id, email)
);

create index if not exists chat_shares_chat_id_idx on public.chat_shares(chat_id);
create index if not exists chat_shares_email_idx on public.chat_shares(lower(email));

drop trigger if exists chat_shares_set_updated_at on public.chat_shares;
create trigger chat_shares_set_updated_at
  before update on public.chat_shares
  for each row execute function public.set_updated_at();

alter table public.chat_shares enable row level security;

-- Policies for chat_shares using is_chat_owner (SECURITY DEFINER, no recursion)
drop policy if exists "chat_shares_owner_select" on public.chat_shares;
create policy "chat_shares_owner_select" on public.chat_shares
  for select using (
    public.is_chat_owner(chat_id, auth.uid())
  );

drop policy if exists "chat_shares_owner_insert" on public.chat_shares;
create policy "chat_shares_owner_insert" on public.chat_shares
  for insert with check (
    public.is_chat_owner(chat_id, auth.uid())
  );

drop policy if exists "chat_shares_owner_update" on public.chat_shares;
create policy "chat_shares_owner_update" on public.chat_shares
  for update using (
    public.is_chat_owner(chat_id, auth.uid())
  ) with check (
    public.is_chat_owner(chat_id, auth.uid())
  );

drop policy if exists "chat_shares_owner_delete" on public.chat_shares;
create policy "chat_shares_owner_delete" on public.chat_shares
  for delete using (
    public.is_chat_owner(chat_id, auth.uid())
  );

-- 3. Create project_shares table
create table if not exists public.project_shares (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  email text not null,
  role text not null default 'viewer' check (role in ('viewer', 'editor')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, email)
);

create index if not exists project_shares_project_id_idx on public.project_shares(project_id);
create index if not exists project_shares_email_idx on public.project_shares(lower(email));

drop trigger if exists project_shares_set_updated_at on public.project_shares;
create trigger project_shares_set_updated_at
  before update on public.project_shares
  for each row execute function public.set_updated_at();

alter table public.project_shares enable row level security;

-- Policies for project_shares using is_project_owner (SECURITY DEFINER, no recursion)
drop policy if exists "project_shares_owner_select" on public.project_shares;
create policy "project_shares_owner_select" on public.project_shares
  for select using (
    public.is_project_owner(project_id, auth.uid())
  );

drop policy if exists "project_shares_owner_insert" on public.project_shares;
create policy "project_shares_owner_insert" on public.project_shares
  for insert with check (
    public.is_project_owner(project_id, auth.uid())
  );

drop policy if exists "project_shares_owner_update" on public.project_shares;
create policy "project_shares_owner_update" on public.project_shares
  for update using (
    public.is_project_owner(project_id, auth.uid())
  ) with check (
    public.is_project_owner(project_id, auth.uid())
  );

drop policy if exists "project_shares_owner_delete" on public.project_shares;
create policy "project_shares_owner_delete" on public.project_shares
  for delete using (
    public.is_project_owner(project_id, auth.uid())
  );

-- 4. Update chats & chat_messages RLS to use SECURITY DEFINER functions (breaks 42P17 cycle)
drop policy if exists "chats_select_shared" on public.chats;
create policy "chats_select_shared" on public.chats
  for select using (
    public.is_chat_collaborator(id, auth.jwt() ->> 'email')
  );

drop policy if exists "chat_messages_select_shared" on public.chat_messages;
create policy "chat_messages_select_shared" on public.chat_messages
  for select using (
    public.is_chat_collaborator(chat_id, auth.jwt() ->> 'email')
  );

drop policy if exists "chat_messages_insert_editor" on public.chat_messages;
create policy "chat_messages_insert_editor" on public.chat_messages
  for insert with check (
    public.is_chat_editor(chat_id, auth.jwt() ->> 'email')
  );

-- 5. Optional shared read policy on projects
drop policy if exists "projects_select_shared" on public.projects;
create policy "projects_select_shared" on public.projects
  for select using (
    public.is_project_collaborator(id, auth.jwt() ->> 'email')
  );
