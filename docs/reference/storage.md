---
title: "Storage API"
sidebarTitle: "Storage"
description: "API reference for the mcp-ts sessions storage proxy, supported backend drivers, and the session-store interface."
icon: "database"
---

### `sessions`

Global `sessions` instance that automatically selects the appropriate backend based on environment configuration.

```typescript
import { sessions } from '@mcp-ts/client';
```

Because `sessions` is a lazy async proxy, call its methods with `await` in real code, including `generateSessionId()`.

#### Configuration

```bash
# Redis
MCP_TS_STORAGE_TYPE=redis
REDIS_URL=redis://localhost:6379

# File system
MCP_TS_STORAGE_TYPE=file
MCP_TS_STORAGE_FILE=./sessions.json

# In-memory
MCP_TS_STORAGE_TYPE=memory
```

---

### Storage methods

**`generateSessionId(): Promise<string>`**

```typescript
const sessionId = await sessions.generateSessionId();
```

**`create(session: Session): Promise<void>`**

```typescript
await sessions.create({
  sessionId: 'abc123',
  userId: 'user-123',
  serverId: 'server-id',
  serverName: 'My Server',
  serverUrl: 'https://mcp.example.com',
  callbackUrl: 'https://myapp.com/callback',
  transport: { type: 'streamable-http' },
  status: 'active',
  createdAt: Date.now(),
});
```

**`update(userId, sessionId, data): Promise<void>`**

```typescript
await sessions.update('user-123', 'abc123', {
  status: 'pending',
});
```

**`get(userId, sessionId, options?): Promise<Session | null>`**

Returns session data. Pass `{ includeCredentials: true }` to include OAuth credential fields.

```typescript
const session = await sessions.get('user-123', 'abc123');
const sessionWithCreds = await sessions.get('user-123', 'abc123', { includeCredentials: true });
```

**`getCredentials(userId, sessionId): Promise<SessionCredentials | null>`**

Returns only credential fields (tokens, client info, code verifier, OAuth state).

```typescript
const creds = await sessions.getCredentials('user-123', 'abc123');
console.log(creds?.tokens?.access_token);
```

**`patchCredentials(userId, sessionId, data): Promise<void>`**

Updates credential fields on an existing session.

```typescript
await sessions.patchCredentials('user-123', 'abc123', {
  tokens: { access_token: 'xyz', token_type: 'Bearer' },
});
```

**`clearCredentials(userId, sessionId): Promise<void>`**

Clears all credential fields while keeping session metadata intact.

```typescript
await sessions.clearCredentials('user-123', 'abc123');
```

**`list(userId): Promise<Session[]>`**

```typescript
const sessionList = await sessions.list('user-123');
```

**`listIds(userId): Promise<string[]>`**

```typescript
const sessionIds = await sessions.listIds('user-123');
```

**`delete(userId, sessionId): Promise<void>`**

```typescript
await sessions.delete('user-123', 'abc123');
```

**`listAllIds(): Promise<string[]>`**

```typescript
const allSessions = await sessions.listAllIds();
```

**`clearAll(): Promise<void>`**

```typescript
await sessions.clearAll();
```

**`cleanupExpired(): Promise<void>`**

```typescript
await sessions.cleanupExpired();
```

**`disconnect(): Promise<void>`**

```typescript
await sessions.disconnect();
```

---

### Direct backends

```typescript
import {
  RedisStorageBackend,
  MemoryStorageBackend,
  FileStorageBackend,
} from '@mcp-ts/client';
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);
const redisStorage = new RedisStorageBackend(redis);
await redisStorage.init();

const fileStorage = new FileStorageBackend({ path: './sessions.json' });
await fileStorage.init();

const memoryStorage = new MemoryStorageBackend();
await memoryStorage.init();
```
