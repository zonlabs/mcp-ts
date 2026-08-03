-- Create the mcp_sessions table
CREATE TABLE IF NOT EXISTS public.mcp_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id TEXT NOT NULL UNIQUE,
    user_id TEXT NOT NULL, -- Will store the application user's ID
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

-- Add an index on user_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_mcp_sessions_user_id ON public.mcp_sessions(user_id);
-- Add an index on expires_at to speed up the cleanup job
CREATE INDEX IF NOT EXISTS idx_mcp_sessions_expires_at ON public.mcp_sessions(expires_at);

-- Trigger to automatically update the 'updated_at' column
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

-- Enable Row Level Security (RLS)
ALTER TABLE public.mcp_sessions ENABLE ROW LEVEL SECURITY;

-- Policy 1: Users can read their own sessions
CREATE POLICY "Users can view their own sessions"
ON public.mcp_sessions
FOR SELECT
TO authenticated
USING (
    auth.uid()::text = user_id
);

-- Policy 2: Users can insert their own sessions
CREATE POLICY "Users can insert their own sessions"
ON public.mcp_sessions
FOR INSERT
TO authenticated
WITH CHECK (
    auth.uid()::text = user_id
);

-- Policy 3: Users can update their own sessions
CREATE POLICY "Users can update their own sessions"
ON public.mcp_sessions
FOR UPDATE
TO authenticated
USING (
    auth.uid()::text = user_id
)
WITH CHECK (
    auth.uid()::text = user_id
);

-- Policy 4: Users can delete their own sessions
CREATE POLICY "Users can delete their own sessions"
ON public.mcp_sessions
FOR DELETE
TO authenticated
USING (
    auth.uid()::text = user_id
);
