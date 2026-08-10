---
title: "Supabase"
sidebarTitle: "Supabase"
description: "Use Supabase Postgres as the mcp-ts session storage backend, including service_role configuration, Row Level Security setup, and the required schema migration."
---

**Cloud-native PostgreSQL storage with built-in security and row-level security (RLS).**

Supabase provides a powerful, scalable backend for your MCP sessions. Ideal for:
- Production environments
- Next.js applications (built-in integration)
- Applications requiring Row Level Security (RLS)
- Managed PostgreSQL with zero maintenance

## Installation

```bash
npm install @mcp-ts/sdk @supabase/supabase-js
```

## Configuration

```bash
# Explicit selection (optional)
MCP_TS_STORAGE_TYPE=supabase

# Supabase connection details (required)
SUPABASE_URL=https://your-project.supabase.co
# Use the service_role key for server-side storage (not the anon key)
SUPABASE_SECRET_KEY=your-secret-key
```

<Warning>
**Always use `SUPABASE_SECRET_KEY`** for server-side storage — not `SUPABASE_ANON_KEY`. The anon key is subject to Row Level Security (RLS) policies which will block session creation. The service_role key is designed for trusted server-to-server communication and bypasses RLS. Find it in: **Supabase Dashboard → Project Settings → API → service_role**.
</Warning>

## Database Setup

To use Supabase as a storage backend, you must create the `mcp_sessions` table and configure RLS policies.

### Option A: Supabase CLI (Recommended)

You can easily "eject" the required migration SQL into your own project using the built-in CLI:

1. Run the initialization command:
   ```bash
   npx mcp-ts supabase-init
   ```
   This copies the provider migrations from `packages/sdk/migrations/supabase/` to your local `./supabase/migrations/` folder.

2. Link your project & push:
   ```bash
   npx supabase link --project-ref <your-project-id>
   npx supabase db push
   ```

### Option B: SQL Editor (Manual)

If you prefer manual setup, copy the SQL from the [migration file](https://github.com/zonlabs/mcp-ts/blob/main/packages/sdk/migrations/supabase/20260330195700_install_mcp_sessions.sql) and run it in the Supabase Dashboard SQL Editor.

### Why RLS?

`mcp-ts` uses the `service_role` key for server-side Supabase storage, and that key bypasses RLS. Session access is still scoped by `userId` in application queries.

The migration also defines RLS policies for Supabase's authenticated client path. If the `mcp_sessions` table is queried through that path, the policies use `auth.uid()` to ensure users can only access rows where `user_id` matches their Supabase user ID.

## Schema

The canonical Supabase migration is available at `packages/sdk/migrations/supabase/20260330195700_install_mcp_sessions.sql`.

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

### RLS policies

The install migration enables RLS on `mcp_sessions` and creates authenticated-user policies for `SELECT`, `INSERT`, `UPDATE`, and `DELETE`, each scoped to:

```sql
auth.uid()::text = user_id
```

That means:

- authenticated users can only access rows tied to their own Supabase user ID
- server-side code using `SUPABASE_SECRET_KEY` bypasses those policies, which is why `mcp-ts` recommends that key for backend storage operations

## Features

- **PostgreSQL persistence** with JSONB support
- **Row Level Security (RLS)** for tenant isolation
- **Automatic management** of `updated_at` and `expires_at`
- **Automatic session cleanup** via `pg_cron` — expired pending sessions are swept every 5 minutes
- **Cloud-native** and serverless friendly
- **Application-level AES-256-GCM encryption** for `tokens` and `headers`

## Session Cleanup

When a client disconnects unexpectedly or a connection error occurs during setup, session data can become stale in the database. To prevent leftover data from accumulating, `mcp-ts` includes a migration that sets up automatic cleanup jobs using PostgreSQL's [`pg_cron`](https://supabase.com/docs/guides/database/extensions/pg_cron) extension.

<Info>
The `pg_cron` extension is available on all Supabase plans (including Free). The cleanup migrations are included automatically when you run `npx mcp-ts supabase-init`.
</Info>

### Session Lifecycle Management

`mcp-ts` implements a multi-stage automated cleanup strategy to keep your database lean while preserving long-lived automation credentials:

**Stage 1: Short-term Transient Purge** (Every 5 minutes)

Cleans up abandoned setup/auth records. These are sessions where `status <> 'active'` and the short 10-minute pending expiration has passed.

**Stage 2: Dormancy Eviction** (Daily at midnight UTC)

Removes active sessions that haven't been touched in 30+ days — long-lived credentials will be refreshed during normal usage, keeping the `updated_at` timestamp fresh.

### Cleanup SQL

```sql
-- Transient purge (every 5 minutes)
DELETE FROM public.mcp_sessions
WHERE expires_at IS NOT NULL
  AND expires_at < now()
  AND status <> 'active';

-- Dormancy eviction (daily at midnight UTC)
DELETE FROM public.mcp_sessions
WHERE status = 'active'
  AND updated_at < now() - interval '30 days';
```

The cleanup cron migration is at `packages/sdk/migrations/supabase/20260421010000_add_session_cleanup_cron.sql` and is automatically applied when you run `npx mcp-ts supabase-init`.

## Encryption

When `STORAGE_ENCRYPTION_KEY` is set in your environment, the SDK encrypts sensitive fields (`tokens`, `headers`, `client_information`, `code_verifier`) using AES-256-GCM before writing to the database. Decryption is transparent at read time.

```bash
# Generate a 64-char hex key:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Set in your environment:
STORAGE_ENCRYPTION_KEY=your-64-char-hex-key
```

Without the key, data is stored in plain text (suitable for development; not recommended for production).

## Usage

### Option 1: Automatic Detection (Recommended)

When `SUPABASE_URL` and `SUPABASE_SECRET_KEY` are present in your environment, the global `sessions` proxy automatically uses the Supabase backend.

```typescript
import { sessions } from '@mcp-ts/sdk/server';

const sessionList = await sessions.list('user-123');
```

### Option 2: Manual Instantiation

If you want to manage the Supabase client yourself or use multiple backends:

```typescript
import { createClient } from '@supabase/supabase-js';
import { createSupabaseStorageBackend } from '@mcp-ts/sdk/server';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!);
const supabaseBackend = createSupabaseStorageBackend(supabase);
await supabaseBackend.init();

const sessionList = await supabaseBackend.list('user-123');
```

## Troubleshooting

### RLS Policy Violations

If you see RLS violations or authorization errors when creating sessions, make sure you are using `SUPABASE_SECRET_KEY` (service_role) and not `SUPABASE_ANON_KEY` (anon key). The anon key is subject to RLS policies and cannot create sessions for arbitrary user IDs.

### Table Not Found

Make sure you have run the migration and the `mcp_sessions` table exists in the `public` schema. Run `npx mcp-ts supabase-init` or apply the migration SQL manually.

### Connection Pooling in Serverless

For serverless deployments (Vercel, Lambda, etc.), use Supabase's connection pooler (port 6543) in your connection string to avoid exhausting database connections.
