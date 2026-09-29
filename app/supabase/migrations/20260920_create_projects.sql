-- Migration: 20260920_create_projects.sql
-- Description: Create projects table, link chats to projects, add RLS policies and indices

-- 1. Create projects table
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  custom_instructions text,
  
  -- Pinning & Sharing
  is_pinned boolean not null default false,
  visibility text not null default 'PRIVATE' 
    check (visibility in ('PRIVATE', 'PUBLIC')),
  
  -- Memory settings
  memory_scope text not null default 'global' 
    check (memory_scope in ('global', 'project')),
  
  -- Extensible JSON metadata
  metadata jsonb not null default '{}'::jsonb,
  
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Link existing chats table to projects
alter table public.chats 
  add column if not exists project_id uuid references public.projects(id) on delete set null;

-- 3. Performance indices
create index if not exists projects_user_id_idx on public.projects(user_id);
create index if not exists projects_user_pinned_idx 
  on public.projects(user_id, is_pinned desc, updated_at desc);
create index if not exists chats_project_id_idx 
  on public.chats(project_id);
create index if not exists chats_project_user_idx 
  on public.chats(project_id, user_id, updated_at desc);

-- 4. Trigger to keep updated_at in sync
drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

-- 5. Row Level Security
alter table public.projects enable row level security;

drop policy if exists "projects_select" on public.projects;
create policy "projects_select" on public.projects
  for select using (auth.uid() = user_id or visibility = 'PUBLIC');

drop policy if exists "projects_insert_own" on public.projects;
create policy "projects_insert_own" on public.projects
  for insert with check (auth.uid() = user_id);

drop policy if exists "projects_update_own" on public.projects;
create policy "projects_update_own" on public.projects
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "projects_delete_own" on public.projects;
create policy "projects_delete_own" on public.projects
  for delete using (auth.uid() = user_id);

-- 6. Storage bucket for project files
insert into storage.buckets (id, name, public, file_size_limit)
values ('project-files', 'project-files', false, 10485760)
on conflict (id) do update set file_size_limit = 10485760;

drop policy if exists "Allow authenticated uploads to project-files" on storage.objects;
create policy "Allow authenticated uploads to project-files"
on storage.objects for insert
to authenticated
with check (bucket_id = 'project-files');

drop policy if exists "Allow authenticated reads from project-files" on storage.objects;
create policy "Allow authenticated reads from project-files"
on storage.objects for select
to authenticated
using (bucket_id = 'project-files');

drop policy if exists "Allow authenticated updates to project-files" on storage.objects;
create policy "Allow authenticated updates to project-files"
on storage.objects for update
to authenticated
using (bucket_id = 'project-files')
with check (bucket_id = 'project-files');

drop policy if exists "Allow authenticated deletes from project-files" on storage.objects;
create policy "Allow authenticated deletes from project-files"
on storage.objects for delete
to authenticated
using (bucket_id = 'project-files');

-- 7. Project files table
create table if not exists public.project_files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  size_bytes bigint not null,
  mime_type text not null,
  storage_path text not null,
  content text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists project_files_project_id_idx on public.project_files(project_id);
create index if not exists project_files_user_id_idx on public.project_files(user_id);

alter table public.project_files enable row level security;

drop policy if exists "project_files_select" on public.project_files;
create policy "project_files_select" on public.project_files
  for select using (
    auth.uid() = user_id or exists (
      select 1 from public.projects p where p.id = project_files.project_id and p.visibility = 'PUBLIC'
    )
  );

drop policy if exists "project_files_insert" on public.project_files;
create policy "project_files_insert" on public.project_files
  for insert with check (auth.uid() = user_id);

drop policy if exists "project_files_delete" on public.project_files;
create policy "project_files_delete" on public.project_files
  for delete using (auth.uid() = user_id);

