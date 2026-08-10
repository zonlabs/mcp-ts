-- ============================================
-- MCP TOOL CALL EVENTS
-- ============================================
CREATE TABLE IF NOT EXISTS mcp_tool_call_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  mcp_session_id TEXT,
  server_id TEXT,
  server_name TEXT,
  app_key TEXT,
  tool_name TEXT NOT NULL,
  tool_namespace TEXT,
  event_type TEXT NOT NULL DEFAULT 'downstream_tool'
    CHECK (event_type IN ('top_level', 'downstream_tool', 'schema_inspection')),
  status TEXT NOT NULL CHECK (status IN ('success', 'error')),
  error_code TEXT,
  error_preview TEXT CHECK (error_preview IS NULL OR char_length(error_preview) <= 240),
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL,
  duration_ms INTEGER NOT NULL CHECK (duration_ms >= 0),
  server_url TEXT,
  server_icons JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT mcp_tool_call_events_owner CHECK (length(trim(user_id)) > 0),
  CONSTRAINT mcp_tool_call_events_request CHECK (length(trim(request_id)) > 0),
  CONSTRAINT mcp_tool_call_events_tool CHECK (length(trim(tool_name)) > 0)
);

ALTER TABLE mcp_tool_call_events
  ADD COLUMN IF NOT EXISTS event_type TEXT NOT NULL DEFAULT 'downstream_tool';

ALTER TABLE mcp_tool_call_events
  ADD COLUMN IF NOT EXISTS server_url TEXT;

ALTER TABLE mcp_tool_call_events
  ADD COLUMN IF NOT EXISTS server_icons JSONB;

DO $$
BEGIN
  ALTER TABLE mcp_tool_call_events
    ADD CONSTRAINT mcp_tool_call_events_event_type
    CHECK (event_type IN ('top_level', 'downstream_tool', 'schema_inspection'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_mcp_tool_call_events_user_started
  ON mcp_tool_call_events(user_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_mcp_tool_call_events_user_event_started
  ON mcp_tool_call_events(user_id, event_type, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_mcp_tool_call_events_user_app_started
  ON mcp_tool_call_events(user_id, app_key, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_mcp_tool_call_events_user_status_started
  ON mcp_tool_call_events(user_id, status, started_at DESC);

ALTER TABLE mcp_tool_call_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mcp_tool_call_events_select_own" ON mcp_tool_call_events;

CREATE POLICY "mcp_tool_call_events_select_own"
  ON mcp_tool_call_events FOR SELECT
  USING (auth.uid()::text = user_id);