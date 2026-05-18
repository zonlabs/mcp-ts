---
title: 'v2.0 Migration Guide'
description: 'How to migrate your application to mcp-ts v2.0.0'
---

v2.0.0 introduces some breaking changes to standardize the API and improve maintainability. This guide will help you upgrade your application from v1.x to v2.x.

## 1. Storage API changes

In previous versions, session and connection management was handled through the `storage` object. This has been renamed to `sessions` to better reflect its purpose and provide a more intuitive API.

### Before (v1.x)
```typescript
import { storage } from '@mcp-ts/sdk';

// Accessing connections or sessions
const userSessions = await storage.getSessions(userId);
```

### After (v2.0.0)
```typescript
import { sessions } from '@mcp-ts/sdk';

// Use the new sessions API methods
const newSession = await sessions.create(userId, data);
const userSessions = await sessions.list(userId);
const session = await sessions.get(sessionId);
await sessions.update(sessionId, updates);
```

## 2. useMcp hook update

The `useMcp` React hook has been updated to use `userId` instead of `identity`, standardizing how we refer to user identifiers across the SDK.

### Before (v1.x)
```typescript
import { useMcp } from '@mcp-ts/sdk/react';

const { tools } = useMcp({
  identity: "user_123"
});
```

### After (v2.0.0)
```typescript
import { useMcp } from '@mcp-ts/sdk/react';

const { tools } = useMcp({
  userId: "user_123"
});
```

## 3. Database schema migrations

If you are using a database-backed storage solution such as **Supabase**, **Neon**, **SQLite**, or any other SQL backend, the schema has changed to reflect the new `sessions` and `userId` terminology.

You must run the provided database migrations to update your schema. 

Migration scripts are located in the `migrations` directory of the `mcp-ts` repository (`mcp-ts/migrations`). Be sure to apply the appropriate migration script for your specific storage backend before deploying v2.0.0 to production.

For more detailed information, see the [Storage Backends](/storage-backends/overview) documentation.
