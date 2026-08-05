-- Create the mcp_sessions table for Neon Postgres.
-- Run this with an owner/admin role, then grant app access with the least-privilege SQL below.

CREATE TABLE IF NOT EXISTS public.mcp_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id TEXT NOT NULL UNIQUE,
    user_id TEXT NOT NULL,
    server_id TEXT,
    server_name TEXT,
    server_url TEXT NOT NULL,
    transport_type TEXT NOT NULL,
    callback_url TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    active BOOLEAN DEFAULT false,
    headers JSONB,
    client_information JSONB,
    tokens JSONB,
    code_verifier TEXT,
    client_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_mcp_sessions_user_id ON public.mcp_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_mcp_sessions_expires_at ON public.mcp_sessions(expires_at);

CREATE OR REPLACE FUNCTION public.set_current_timestamp_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_mcp_sessions_updated_at ON public.mcp_sessions;

CREATE TRIGGER trg_mcp_sessions_updated_at
BEFORE UPDATE ON public.mcp_sessions
FOR EACH ROW
EXECUTE FUNCTION public.set_current_timestamp_updated_at();

-- Optional production configuration:
-- Create a dedicated app role and use its credentials in NEON_DATABASE_URL.
-- Replace neondb and the password before running.
--
-- CREATE ROLE mcp_service_role LOGIN PASSWORD 'replace-with-a-strong-password';
-- GRANT CONNECT ON DATABASE neondb TO mcp_service_role;
-- GRANT USAGE ON SCHEMA public TO mcp_service_role;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON public.mcp_sessions TO mcp_service_role;
-- GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO mcp_service_role;

-- Optional RLS configuration:
-- Uncomment and run this block after creating mcp_service_role if you want
-- to enforce access through Row Level Security for the dedicated app role.
--
-- REVOKE ALL ON public.mcp_sessions FROM PUBLIC;
-- REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC;
--
-- GRANT SELECT, INSERT, UPDATE, DELETE ON public.mcp_sessions TO mcp_service_role;
-- GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO mcp_service_role;
--
-- ALTER TABLE public.mcp_sessions ENABLE ROW LEVEL SECURITY;
--
-- CREATE POLICY mcp_service_role_full_access
-- ON public.mcp_sessions
-- FOR ALL
-- TO mcp_service_role
-- USING (true)
-- WITH CHECK (true);
