-- Optional Neon pg_cron cleanup jobs.
--
-- Neon pg_cron requires endpoint-level setup before this migration can run:
-- configure cron.database_name for your compute endpoint, restart the compute,
-- then install/schedule jobs from the target database.
--
-- If pg_cron is not enabled for your Neon project, skip this migration and run
-- storage.cleanupExpiredSessions() from your application scheduler instead.

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Keep reruns idempotent without NOTICE noise.
SELECT cron.unschedule(jobname)
FROM cron.job
WHERE jobname IN (
  'mcp-cleanup-transient-sessions',
  'mcp-cleanup-dormant-sessions'
);

-- Stage 1: Short-term Transient Purge (every 5 minutes)
-- Removes abandoned OAuth flows and other transient
-- sessions whose pending expiration has passed.
SELECT cron.schedule(
    'mcp-cleanup-transient-sessions',
    '*/5 * * * *',
    $$DELETE FROM public.mcp_sessions WHERE expires_at IS NOT NULL AND expires_at < now() AND status <> 'active';$$
);

-- Stage 2: Long-term Dormancy Eviction (daily at midnight UTC)
-- Removes active sessions that have not been touched for 30+ days.
SELECT cron.schedule(
    'mcp-cleanup-dormant-sessions',
    '0 0 * * *',
    $$DELETE FROM public.mcp_sessions WHERE status = 'active' AND updated_at < now() - interval '30 days';$$
);
