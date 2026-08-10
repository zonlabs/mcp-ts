create table if not exists public.mcp_oauth_authorization_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

-- RLS: Enabled, but no select/update policies. Only service_role can access.
alter table public.mcp_oauth_authorization_codes enable row level security;

comment on table public.mcp_oauth_authorization_codes is
  'Short-lived authorization codes to prevent OAuth code replay attacks.';

-- Enable pg_cron and schedule daily cleanup of consumed or expired authorization codes.
create extension if not exists pg_cron;

select cron.schedule(
  'cleanup-expired-mcp-oauth-codes',
  '0 0 * * *', -- Run daily at midnight UTC
  $$delete from public.mcp_oauth_authorization_codes where expires_at < now() or consumed_at is not null$$
);
