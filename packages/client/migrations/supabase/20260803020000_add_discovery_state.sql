ALTER TABLE public.mcp_sessions
    ADD COLUMN IF NOT EXISTS discovery_state JSONB;
