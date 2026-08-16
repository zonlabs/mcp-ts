ALTER TABLE public.mcp_sessions
    ADD COLUMN IF NOT EXISTS server_options JSONB;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'mcp_sessions'
          AND column_name = 'transport_type'
    ) THEN
        ALTER TABLE public.mcp_sessions ALTER COLUMN transport_type DROP NOT NULL;
    END IF;
END $$;
