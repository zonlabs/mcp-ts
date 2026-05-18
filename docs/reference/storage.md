---
title: "Storage API"
sidebarTitle: "Storage"
description: "API reference for the mcp-ts sessions storage proxy, supported backend drivers, and the StorageBackend interface for building custom session stores."
icon: "database"
---

### `sessions`

Global `sessions` instance that automatically selects the appropriate backend based on environment configuration. It follows a Repository-inspired interface for managing MCP sessions.

```typescript
import { sessions } from '@mcp-ts/sdk/server';
```

#### Configuration

The storage backend is selected automatically:

```bash
# Redis (Production)
MCP_TS_STORAGE_TYPE=redis
REDIS_URL=redis://localhost:6379

# File System (Development)
MCP_TS_STORAGE_TYPE=file
MCP_TS_STORAGE_FILE=./sessions.json

# In-Memory (Testing - Default)
MCP_TS_STORAGE_TYPE=memory
```

---

### Storage methods

**`generateSessionId(): string`**

Generate a unique session ID.

```typescript
const sessionId = sessions.generateSessionId();
```

---

**`create(session: Session, ttl?: number): Promise<void>`**

Create a new session. Throws if session already exists.

```typescript
await sessions.create({
  sessionId: 'abc123',
  userId: 'user-123',
  serverId: 'server-id',
  serverName: 'My Server',
  serverUrl: 'https://mcp.example.com',
  callbackUrl: 'https://myapp.com/callback',
  transportType: 'sse',
  active: true,
  createdAt: Date.now(),
}, 3600); // Optional TTL in seconds
```

---

**`update(userId: string, sessionId: string, data: Partial<Session>, ttl?: number): Promise<void>`**

Update an existing session with partial data. Throws if session doesn't exist.

```typescript
await sessions.update('user-123', 'abc123', {
  active: false,
  tokens: {
    access_token: 'new-token',
    token_type: 'Bearer',
  },
}, 3600); // Optional TTL refresh
```

---

**`get(userId: string, sessionId: string): Promise<Session | null>`**

Retrieve session data.

```typescript
const session = await sessions.get('user-123', 'abc123');
```

---

**`list(userId: string): Promise<Session[]>`**

Get all session data for a user ID.

```typescript
const sessionList = await sessions.list('user-123');
```

---

**`listIds(userId: string): Promise<string[]>`**

Get all session IDs for a user ID.

```typescript
const sessionIds = await sessions.listIds('user-123');
```

---

**`delete(userId: string, sessionId: string): Promise<void>`**

Delete a session.

```typescript
await sessions.delete('user-123', 'abc123');
```

---

**`listAllIds(): Promise<string[]>`**

Get all session IDs across all users (admin operation).

```typescript
const allSessions = await sessions.listAllIds();
```

---

**`clearAll(): Promise<void>`**

Clear all sessions (admin operation).

```typescript
await sessions.clearAll();
```

---

**`cleanupExpired(): Promise<void>`**

Clean up expired sessions (Redis only, no-op for others).

```typescript
await sessions.cleanupExpired();
```

---

**`disconnect(): Promise<void>`**

Disconnect from storage backend.

```typescript
await sessions.disconnect();
```

---

### Custom session stores

You can also use specific session store backends directly:

```typescript
import { 
  RedisStorageBackend,
  MemoryStorageBackend,
  FileStorageBackend 
} from '@mcp-ts/sdk/server';
import { Redis } from 'ioredis';

// Redis
const redis = new Redis(process.env.REDIS_URL);
const redisStorage = new RedisStorageBackend(redis);

// File System
const fileStorage = new FileStorageBackend({ path: './sessions.json' });
await fileStorage.init();

// In-Memory
const memoryStorage = new MemoryStorageBackend();
```
