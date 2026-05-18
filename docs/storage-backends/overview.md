---
title: "Storage Overview"
sidebarTitle: "Overview"
description: "Compare the mcp-ts storage backends — in-memory, file system, SQLite, Redis, Supabase, and Neon — and choose the right session persistence for your stack."
---

The library supports multiple storage backends for session persistence, allowing you to choose the best option for your deployment environment.

## Automatic backend selection

The library automatically selects the appropriate storage backend using this priority:

```mermaid
graph TD
    A[Start] --> B{MCP_TS_STORAGE_TYPE set?}
    B -->|Yes| C[Use specified backend]
    B -->|No| D{REDIS_URL present?}
    D -->|Yes| E[Use Redis]
    D -->|No| F{SUPABASE_URL present?}
    F -->|Yes| G[Use Supabase]
    F -->|No| N{NEON_DATABASE_URL present?}
    
    C --> L[Storage Ready]
    E --> L
    G --> L
    N -->|Yes| O[Use Neon]
    O --> L
    
    N -->|No| H{MCP_TS_STORAGE_FILE present?}
    H -->|Yes| I[Use File System]
    H -->|No| J{MCP_TS_STORAGE_SQLITE_PATH present?}
    
    I --> L
    J -->|Yes| K[Use SQLite]
    J -->|No| M[Use In-Memory Default]
    
    K --> L
    M --> L
```

**Priority Order:**

1. **Explicit**: If `MCP_TS_STORAGE_TYPE` is set, use that backend
2. **Auto-detect Redis**: If `REDIS_URL` is present, use Redis
3. **Auto-detect Supabase**: If `SUPABASE_URL` is present, use Supabase
4. **Auto-detect Neon**: If `NEON_DATABASE_URL` is present, use Neon
5. **Auto-detect File**: If `MCP_TS_STORAGE_FILE` is present, use File
6. **Auto-detect SQLite**: If `MCP_TS_STORAGE_SQLITE_PATH` is present, use SQLite
7. **Default**: Fall back to In-Memory storage

## Backend comparison

| Feature | Redis | Supabase | Neon | SQLite | File System | In-Memory |
|---------|----------|----------|----------|----------|----------------|--------------|
| **Persistence** | Yes | Yes | Yes | Yes | Yes | No |
| **Distributed** | Yes | Yes | Yes | No | No | No |
| **Auto-Expiry** | Yes (TTL) | Yes (Manual) | Yes (Manual) | Yes (Manual) | No | No |
| **Performance** | Fast | Fast | Fast | Very Fast | Medium | Fastest |
| **Setup** | External | Cloud | Cloud | Native | Built-in | Built-in |
| **Serverless** | Yes | Recommended | Recommended | Limited | No | Yes |
| **Production** | Recommended | Recommended | Recommended | Single-instance | Not recommended | Not recommended |

## Custom backend implementation

You can use specific storage backends directly:

```typescript
import { 
  RedisStorageBackend,
  MemoryStorageBackend,
  FileStorageBackend,
  NeonStorageBackend
} from '@mcp-ts/sdk/server';
import { Redis } from 'ioredis';
import { neon } from '@neondatabase/serverless';

// Custom Redis instance
const redis = new Redis({
  host: 'localhost',
  port: 6379,
  password: 'secret',
});
const redisStorage = new RedisStorageBackend(redis);

// Custom file path
const fileStorage = new FileStorageBackend({ 
  path: '/var/data/sessions.json' 
});
await fileStorage.init();

// Custom Neon query function
const sql = neon(process.env.NEON_DATABASE_URL!);
const neonStorage = new NeonStorageBackend(sql);
await neonStorage.init();

// In-memory for testing
const memoryStorage = new MemoryStorageBackend();
```

## Session data structure

All backends store the same session data structure:

```typescript
interface Session {
  sessionId: string;
  userId: string;
  serverId?: string;
  serverName?: string;
  serverUrl: string;
  callbackUrl: string;
  transportType: 'sse' | 'streamable-http';
  active: boolean;
  createdAt: number;
  headers?: Record<string, string>;
  // OAuth data
  tokens?: OAuthTokens;
  clientInformation?: OAuthClientInformation;
  codeVerifier?: string;
  clientId?: string;
}
```
