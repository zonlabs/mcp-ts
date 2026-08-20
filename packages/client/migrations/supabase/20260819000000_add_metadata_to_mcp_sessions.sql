-- Add caller-supplied metadata to mcp_sessions.
-- The library stores this opaquely and never reads or interprets it.
-- Callers can use it to attach their own reference IDs
-- (e.g. a catalog server ID, tenant ID, workspace ID, etc.).

ALTER TABLE public.mcp_sessions
ADD COLUMN IF NOT EXISTS metadata JSONB;
