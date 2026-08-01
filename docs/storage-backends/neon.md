---
title: "Neon"
sidebarTitle: "Neon"
description: "Configure Neon serverless Postgres as a storage backend for MCP sessions, including pooled connection strings, dedicated roles, and HTTP query setup."
---

**Serverless Postgres storage for production deployments.**

Neon support uses the optional `@neondatabase/serverless` peer dependency and the HTTP query API. It is a good fit for serverless applications that need durable MCP session storage without running Redis.

## Installation

```bash
npm install @neondatabase/serverless
```

## Configuration

```bash
MCP_TS_STORAGE_TYPE=neon
NEON_DATABASE_URL=postgresql://user:password@host.neon.tech/dbname?sslmode=verify-full&channel_binding=require
```

`DATABASE_URL` is also supported when `MCP_TS_STORAGE_TYPE=neon` is set. Auto-detection only uses `NEON_DATABASE_URL` so a generic `DATABASE_URL` does not unexpectedly change the selected storage backend.

Use a pooled Neon connection string for serverless deployments when your app may create many concurrent function instances. Neon integrations commonly expose pooled URLs through `DATABASE_URL`; direct/unpooled URLs are better reserved for migrations and long-running administrative work.

## Security

Create a dedicated application role instead of using the Neon owner/admin role in production. The role only needs to connect to the database and read/write the `mcp_sessions` table.

```sql
CREATE ROLE mcp_service_role LOGIN PASSWORD 'replace-with-a-strong-password';

GRANT CONNECT ON DATABASE neondb TO mcp_service_role;
GRANT USAGE ON SCHEMA public TO mcp_service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mcp_sessions TO mcp_service_role;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO mcp_service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO mcp_service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
GRANT USAGE ON SEQUENCES TO mcp_service_role;
```

For strongest transport security, prefer `sslmode=verify-full`. Add `channel_binding=require` when supported by your runtime and connection path. Do not log or commit Neon connection strings; store them in your deployment environment variables.

### Optional RLS configuration

The install migration includes an optional RLS block at the bottom. The base schema does not require RLS. If you want to enforce access through Row Level Security for the dedicated app role, create `mcp_service_role`, then uncomment and run the RLS block from the migration.

The optional block:

- Revokes public access to `public.mcp_sessions`.
- Grants read/write access to `mcp_service_role`.
- Enables Row Level Security on the sessions table.
- Adds policies that allow the server-side `mcp_service_role` to perform storage operations.

This optional block limits table access to the dedicated backend role. The Neon storage backend is intended for server-side use, and session access is scoped by `userId` in application queries.

## Schema

The canonical base migration is at `packages/sdk/migrations/neon/20260513010000_install_mcp_sessions.sql`. Run it with an owner/admin role, then connect the application using the least-privilege role from the Security section.

Session connection metadata and OAuth runtime credentials live in a single `mcp_sessions` table:

### `public.mcp_sessions`

```sql
CREATE TABLE IF NOT EXISTS public.mcp_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id TEXT NOT NULL UNIQUE,
    user_id TEXT NOT NULL,
    server_id TEXT,
    server_name TEXT,
    server_url TEXT NOT NULL,
    server_options JSONB,
    callback_url TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'active')),
    headers JSONB,
    auth_url TEXT,
    enabled BOOLEAN DEFAULT true,
    tool_policy JSONB,
    client_information JSONB,
    tokens JSONB,
    code_verifier TEXT,
    client_id TEXT,
    oauth_state JSONB,
    CONSTRAINT mcp_sessions_user_session_unique
        UNIQUE (user_id, session_id)
);
```

### Indexes and update trigger

```sql
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
```

### Optional RLS block

The install migration keeps the RLS section optional for Neon, but when enabled it covers the sessions table and grants full access to the dedicated backend role:

```sql
ALTER TABLE public.mcp_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY mcp_service_role_full_access
ON public.mcp_sessions
FOR ALL
TO mcp_service_role
USING (true)
WITH CHECK (true);
```

## Usage

### Option 1: Automatic Detection (Recommended)

When `MCP_TS_STORAGE_TYPE=neon` and `NEON_DATABASE_URL` are present in your environment, the global `sessions` proxy automatically uses the Neon backend.

```typescript
import { sessions } from '@mcp-ts/client/server';

// This will use Neon automatically if env vars are set
const sessionList = await sessions.list('user-123');
```

### Option 2: Manual Instantiation

If you want to manage the Neon SQL client yourself or use multiple storage backends:

```typescript
import { neon } from '@neondatabase/serverless';
import { createNeonStorageBackend } from '@mcp-ts/client/server';

const sql = neon(process.env.NEON_DATABASE_URL!);
const neonBackend = createNeonStorageBackend(sql);
await neonBackend.init(); // Optional but recommended to verify connection

const sessionList = await neonBackend.list('user-123');
```

## Cleanup

Expired pending sessions and dormant active sessions are removed when `sessions.cleanupExpired()` runs. Schedule that call from your application or platform cron if you want cleanup without database cron support.

If your Neon project has `pg_cron` enabled, you can also run the optional migration at `packages/sdk/migrations/neon/20260513020000_add_session_cleanup_cron.sql`. Neon requires endpoint-level `cron.database_name` configuration before `pg_cron` can be installed and used. After that setup, the migration schedules:

- `mcp-cleanup-transient-sessions`: every 5 minutes, removes inactive expired sessions.
- `mcp-cleanup-dormant-sessions`: daily at midnight UTC, removes active sessions untouched for 30+ days.

If `pg_cron` is not enabled for your Neon project, skip the optional migration and use application/platform scheduling instead.
