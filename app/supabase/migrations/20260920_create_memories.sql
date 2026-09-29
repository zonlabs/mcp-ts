-- Enable the vector extension
create extension if not exists vector;

-- Create the memories table for Mem0
create table if not exists public.memories (
  id text primary key,
  embedding vector(1536),
  metadata jsonb default '{}'::jsonb,
  created_at timestamp with time zone default timezone('utc', now()),
  updated_at timestamp with time zone default timezone('utc', now())
);

-- Create the memory migrations table for Mem0
create table if not exists public.memory_migrations (
  user_id text primary key,
  created_at timestamp with time zone default timezone('utc', now())
);

-- Indices for performance
create index if not exists memories_metadata_idx on public.memories using gin (metadata);
create index if not exists memories_embedding_idx on public.memories using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- Enable RLS
alter table public.memories enable row level security;
alter table public.memory_migrations enable row level security;

-- Policies for memories
drop policy if exists "memories_select_policy" on public.memories;
create policy "memories_select_policy" on public.memories
for select
using (
  auth.role() = 'service_role' 
  or (auth.uid() is not null and metadata->>'user_id' = auth.uid()::text)
);

drop policy if exists "memories_insert_policy" on public.memories;
create policy "memories_insert_policy" on public.memories
for insert
with check (
  auth.role() = 'service_role' 
  or (auth.uid() is not null and metadata->>'user_id' = auth.uid()::text)
);

drop policy if exists "memories_update_policy" on public.memories;
create policy "memories_update_policy" on public.memories
for update
using (
  auth.role() = 'service_role' 
  or (auth.uid() is not null and metadata->>'user_id' = auth.uid()::text)
)
with check (
  auth.role() = 'service_role' 
  or (auth.uid() is not null and metadata->>'user_id' = auth.uid()::text)
);

drop policy if exists "memories_delete_policy" on public.memories;
create policy "memories_delete_policy" on public.memories
for delete
using (
  auth.role() = 'service_role' 
  or (auth.uid() is not null and metadata->>'user_id' = auth.uid()::text)
);

-- Policies for memory_migrations (service role has full access)
drop policy if exists "migrations_service_role" on public.memory_migrations;
create policy "migrations_service_role" on public.memory_migrations
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

-- Create the vector similarity search function expected by Mem0
create or replace function public.match_vectors(
  query_embedding vector(1536),
  match_count int,
  filter jsonb default '{}'::jsonb
)
returns table (
  id text,
  similarity float,
  metadata jsonb
)
language plpgsql
security definer
as $$
begin
  return query
  select
    t.id::text,
    (1 - (t.embedding <=> query_embedding))::float as similarity,
    t.metadata
  from public.memories t
  where case
    when filter::text = '{}'::text then true
    else t.metadata @> filter
  end
  order by t.embedding <=> query_embedding
  limit match_count;
end;
$$;
