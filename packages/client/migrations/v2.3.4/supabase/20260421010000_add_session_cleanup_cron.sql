-- Enable the pg_cron extension (available on all Supabase plans).
-- This is idempotent and safe to run multiple times.
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- -----------------------------------------------------------------------------
-- Stage 1: Short-term Transient Purge (every 5 minutes)
-- -----------------------------------------------------------------------------
-- Targets sessions that are NOT active (failed connections, abandoned OAuth
-- flows, mid-flow errors) whose TTL has expired. Active sessions are explicitly
-- excluded from this sweep to preserve automation credentials.
--
-- The idx_mcp_sessions_expires_at index ensures this is a fast indexed scan.
SELECT cron.schedule(
    'cleanup-transient-sessions',
    '*/5 * * * *',
    $$DELETE FROM public.mcp_sessions WHERE expires_at < now() AND active IS NOT TRUE;$$
);

-- -----------------------------------------------------------------------------
-- Stage 2: Long-term Dormancy Eviction (daily at midnight UTC)
-- -----------------------------------------------------------------------------
-- Safety net for sessions that were successfully established (active = true)
-- but have been completely untouched for 30+ days. This prevents "active"
-- records from persisting indefinitely if they are genuinely abandoned.
SELECT cron.schedule(
    'cleanup-dormant-sessions',
    '0 0 * * *',
    $$DELETE FROM public.mcp_sessions WHERE active = true AND updated_at < now() - interval '30 days';$$
);

-- Add a comment on the extension for visibility in Supabase Dashboard
COMMENT ON EXTENSION pg_cron IS 'Automated Session Lifecycle Management.';
