---
title: "Configuration"
sidebarTitle: "Configuration"
description: "Set up tool policy with SQL storage backends — the tool_policy column is optional and does not require a migration for basic usage."
---

## Optional Column

The `tool_policy` column on `mcp_sessions` is **optional**. The SDK only writes it when you explicitly provide a `toolPolicy` on the session object. If you never set a policy, no migration is needed — the SDK works without the column.

### Without the Column

If you don't run the tool_policy migration:

- `sessions.create()` omits `tool_policy` from the INSERT
- `sessions.update()` omits `tool_policy` from the UPDATE unless you pass it
- `sessions.get()` and `sessions.list()` return `toolPolicy: undefined`, which the SDK treats as `mode: 'all'`

### With the Column

Uncomment the `tool_policy` column in the install schema when you want to persist policies:

**Neon** — `migrations/neon/20260513010000_install_mcp_sessions.sql`:
```sql
    auth_url TEXT,
    -- tool_policy JSONB -- remove the comment to enable
```

**Supabase** — `migrations/supabase/20260330195700_install_mcp_sessions.sql`:
```sql
    auth_url TEXT,
    -- tool_policy JSONB -- remove the comment to enable
```

Run `npx mcp-ts neon-init` or `npx mcp-ts supabase-init` (or apply the migration manually) after uncommenting.

### Adding tool_policy to an existing database

If you already have sessions and want to add tool policy support later, the same SQL works for both Neon and Supabase:

```sql
ALTER TABLE public.mcp_sessions
ADD COLUMN IF NOT EXISTS tool_policy jsonb NOT NULL DEFAULT '{"mode":"all","toolIds":[]}'::jsonb;

UPDATE public.mcp_sessions
SET tool_policy = '{"mode":"all","toolIds":[]}'::jsonb
WHERE tool_policy IS NULL;
```

This adds the column and backfills existing sessions with the unrestricted `all` policy.

## Setting a Policy

Pass `toolPolicy` when creating or updating a session:

```typescript
// Allowlist mode: only these two tools
await sessions.create({
  sessionId: 'sess-123',
  userId: 'user-456',
  serverUrl: 'https://mcp.example.com',
  callbackUrl: 'https://app.com/callback',
  transport: { type: 'streamable-http' },
  toolPolicy: {
    mode: 'allowlist',
    toolIds: ['server-a::get_weather', 'server-a::send_email'],
  },
});

// Denylist mode: all tools except these
await sessions.update('user-456', 'sess-123', {
  toolPolicy: {
    mode: 'denylist',
    toolIds: ['server-a::dangerous_tool'],
  },
});

// Reset to unrestricted
await sessions.update('user-456', 'sess-123', {
  toolPolicy: { mode: 'all', toolIds: [] },
});
```

## Enforcing Policies at Runtime

Use the `ToolPolicyGateway` — it wraps a client and enforces the session's policy before every tool call:

```typescript
import { ToolPolicyGateway } from '@mcp-ts/client/server';

const gateway = new ToolPolicyGateway(client, toolPolicy);

// Throws if the tool is not allowed by the policy
const result = await gateway.callTool('get_weather', { city: 'Tokyo' });
```

The gateway also filters `listTools()` results to only return allowed tools.
