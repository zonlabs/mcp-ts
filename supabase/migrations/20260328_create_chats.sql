create extension if not exists pgcrypto;

create table if not exists public.chats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  visibility text not null default 'PRIVATE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.chats
  drop constraint if exists chats_visibility_chk;

alter table public.chats
  add constraint chats_visibility_chk
  check (visibility in ('PRIVATE', 'PUBLIC'));

create index if not exists chats_user_id_idx on public.chats(user_id);
create index if not exists chats_updated_at_idx on public.chats(updated_at);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  external_id text not null,
  chat_id uuid not null references public.chats(id) on delete cascade,
  role text not null,
  parts jsonb not null default '[]'::jsonb,
  attachments jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  prompt_tokens int,
  completion_tokens int,
  total_tokens int
);

create index if not exists chat_messages_chat_id_idx on public.chat_messages(chat_id);
create index if not exists chat_messages_created_at_idx on public.chat_messages(created_at);
create unique index if not exists chat_messages_external_id_idx on public.chat_messages(chat_id, external_id);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists chats_set_updated_at on public.chats;
create trigger chats_set_updated_at
before update on public.chats
for each row execute function public.set_updated_at();

alter table public.chats enable row level security;

drop policy if exists "chats_select_own" on public.chats;
create policy "chats_select_own" on public.chats
for select
using (auth.uid() = user_id);

drop policy if exists "chats_insert_own" on public.chats;
create policy "chats_insert_own" on public.chats
for insert
with check (auth.uid() = user_id);

drop policy if exists "chats_update_own" on public.chats;
create policy "chats_update_own" on public.chats
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "chats_delete_own" on public.chats;
create policy "chats_delete_own" on public.chats
for delete
using (auth.uid() = user_id);

alter table public.chat_messages enable row level security;

drop policy if exists "chat_messages_select_own" on public.chat_messages;
create policy "chat_messages_select_own" on public.chat_messages
for select
using (
  exists (
    select 1
    from public.chats
    where public.chats.id = chat_messages.chat_id
      and public.chats.user_id = auth.uid()
  )
);

drop policy if exists "chat_messages_insert_own" on public.chat_messages;
create policy "chat_messages_insert_own" on public.chat_messages
for insert
with check (
  exists (
    select 1
    from public.chats
    where public.chats.id = chat_messages.chat_id
      and public.chats.user_id = auth.uid()
  )
);

-- Allow inserts into public chats for collaboration
drop policy if exists "chat_messages_insert_public" on public.chat_messages;
create policy "chat_messages_insert_public" on public.chat_messages
for insert
with check (
  auth.uid() is not null and exists (
    select 1
    from public.chats
    where public.chats.id = chat_messages.chat_id
      and public.chats.visibility in ('PUBLIC')
  )
);

-- Allow public chats to be updated for collaboration (authenticated users only)
drop policy if exists "chat_messages_update_public" on public.chat_messages;
create policy "chat_messages_update_public" on public.chat_messages
for update
using (
  auth.uid() is not null and exists (
    select 1
    from public.chats
    where public.chats.id = chat_messages.chat_id
      and public.chats.visibility in ('PUBLIC')
  )
)
with check (
  auth.uid() is not null and exists (
    select 1
    from public.chats
    where public.chats.id = chat_messages.chat_id
      and public.chats.visibility in ('PUBLIC')
  )
);

-- Allow public chats to be deleted for collaboration (authenticated users only)
drop policy if exists "chat_messages_delete_public" on public.chat_messages;
create policy "chat_messages_delete_public" on public.chat_messages
for delete
using (
  auth.uid() is not null and exists (
    select 1
    from public.chats
    where public.chats.id = chat_messages.chat_id
      and public.chats.visibility in ('PUBLIC')
  )
);

drop policy if exists "chat_messages_update_own" on public.chat_messages;
create policy "chat_messages_update_own" on public.chat_messages
for update
using (
  exists (
    select 1
    from public.chats
    where public.chats.id = chat_messages.chat_id
      and public.chats.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.chats
    where public.chats.id = chat_messages.chat_id
      and public.chats.user_id = auth.uid()
  )
);

drop policy if exists "chat_messages_delete_own" on public.chat_messages;
create policy "chat_messages_delete_own" on public.chat_messages
for delete
using (
  exists (
    select 1
    from public.chats
    where public.chats.id = chat_messages.chat_id
      and public.chats.user_id = auth.uid()
  )
);

-- Allow public chats to be read via share links
drop policy if exists "chats_select_public" on public.chats;
create policy "chats_select_public" on public.chats
for select
using (visibility in ('PUBLIC'));

drop policy if exists "chat_messages_select_public" on public.chat_messages;
create policy "chat_messages_select_public" on public.chat_messages
for select
using (
  exists (
    select 1
    from public.chats
    where public.chats.id = chat_messages.chat_id
      and public.chats.visibility in ('PUBLIC')
  )
);
-- Allow authenticated users to "touch" a public chat (to update its timestamp)
drop policy if exists "chats_update_public" on public.chats;
create policy "chats_update_public" on public.chats
for update
using (auth.uid() is not null and visibility = 'PUBLIC')
with check (
  id = id 
  and user_id = user_id 
  and visibility = visibility
  and title = title 
);
