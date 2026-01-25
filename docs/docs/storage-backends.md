---
sidebar_position: 3
---

# Storage Backends

The library supports multiple storage backends for session persistence, allowing you to choose the best option for your deployment environment.

## 💾 Available Backends

### <img src="/img/redis.svg" alt="Redis" width="24" height="24" style={{display: 'inline', verticalAlign: 'middle'}} /> Redis (Production)

**Recommended for production and serverless deployments.**

Redis provides distributed, persistent storage with automatic TTL (Time To Live) management. Perfect for:
- Production environments
- Serverless deployments (Vercel, AWS Lambda)
- Multi-instance applications
- High-availability setups

**Configuration:**

```bash
# Explicit selection (optional)
MCP_TS_STORAGE_TYPE=redis

# Redis connection URL (required)
REDIS_URL=redis://localhost:6379

# Or for cloud Redis with TLS
REDIS_URL=rediss://default:password@host.upstash.io:6379
```

**Features:**
- ✅ Automatic session expiration (12 hours TTL)
- ✅ Atomic operations for data consistency
- ✅ Distributed storage across instances
- ✅ Production-ready scalability

**Usage:**

```typescript
import { storage } from '@mcp-ts/redis/server';

// Storage automatically uses Redis when REDIS_URL is set
const sessionId = storage.generateSessionId();

await storage.createSession({
  sessionId,
  identity: 'user-123',
  serverUrl: 'https://mcp.example.com',
  callbackUrl: 'https://app.com/callback',
  transportType: 'sse',
  active: true,
  createdAt: Date.now(),
});
```

---

### <img src="/img/filesystem.svg" alt="File System" width="24" height="24" style={{display: 'inline', verticalAlign: 'middle'}} /> File System (Development)

**Perfect for local development with persistent sessions across restarts.**

File storage persists sessions to a JSON file on disk. Ideal for:
- Local development
- Single-instance deployments
- Testing with persistent state
- Environments without Redis

**Configuration:**

```bash
# Explicit selection (optional)
MCP_TS_STORAGE_TYPE=file

# File path for session storage (required)
MCP_TS_STORAGE_FILE=./sessions.json
```

**Features:**
- ✅ Persistent across application restarts
- ✅ No external dependencies
- ✅ Human-readable JSON format
- ✅ Automatic directory creation

**Usage:**

```typescript
import { storage } from '@mcp-ts/redis/server';

// Storage automatically uses File when MCP_TS_STORAGE_FILE is set
const sessions = await storage.getIdentitySessionsData('user-123');
console.log('Stored sessions:', sessions);
```

**File Format:**

```json
[
  {
    "sessionId": "abc123",
    "identity": "user-123",
    "serverId": "server-1",
    "serverName": "My MCP Server",
    "serverUrl": "https://mcp.example.com",
    "callbackUrl": "https://app.com/callback",
    "transportType": "sse",
    "active": true,
    "createdAt": 1706234567890
  }
]
```

---

### <img src="/img/memory.svg" alt="Memory" width="24" height="24" style={{display: 'inline', verticalAlign: 'middle'}} /> In-Memory (Testing)

**Fast ephemeral storage, ideal for testing. Sessions are lost on restart.**

In-memory storage keeps sessions in RAM. Best for:
- Unit testing
- Integration testing
- Quick prototyping
- Temporary sessions

**Configuration:**

```bash
# Explicit selection (optional)
MCP_TS_STORAGE_TYPE=memory

# No additional configuration needed
```

**Features:**
- ✅ Fastest performance
- ✅ No external dependencies
- ✅ Zero configuration
- ⚠️ Sessions lost on restart

**Usage:**

```typescript
import { storage } from '@mcp-ts/redis/server';

// Storage uses in-memory by default if no other backend is configured
await storage.createSession({
  sessionId: 'test-123',
  identity: 'test-user',
  serverUrl: 'https://test.example.com',
  callbackUrl: 'https://test.com/callback',
  transportType: 'sse',
  active: true,
  createdAt: Date.now(),
});
```

---

### <img src="/img/postgres.svg" alt="PostgreSQL" width="24" height="24" style={{display: 'inline', verticalAlign: 'middle'}} /> PostgreSQL (Coming Soon)

PostgreSQL support is planned for a future release, providing:
- Relational data storage
- Advanced querying capabilities
- ACID compliance
- Integration with existing databases

---

## 🔄 Automatic Backend Selection

The library automatically selects the appropriate storage backend using this priority:

```mermaid
graph TD
    A[Start] --> B{MCP_TS_STORAGE_TYPE set?}
    B -->|Yes| C[Use specified backend]
    B -->|No| D{REDIS_URL present?}
    D -->|Yes| E[Use Redis]
    D -->|No| F{MCP_TS_STORAGE_FILE present?}
    F -->|Yes| G[Use File System]
    F -->|No| H[Use In-Memory Default]
    
    C --> I[Storage Ready]
    E --> I
    G --> I
    H --> I
```

**Priority Order:**

1. **Explicit**: If `MCP_TS_STORAGE_TYPE` is set, use that backend
2. **Auto-detect Redis**: If `REDIS_URL` is present, use Redis
3. **Auto-detect File**: If `MCP_TS_STORAGE_FILE` is present, use File
4. **Default**: Fall back to In-Memory storage

---

## 🛠️ Custom Backend Implementation

You can use specific storage backends directly:

```typescript
import { 
  RedisStorageBackend,
  MemoryStorageBackend,
  FileStorageBackend 
} from '@mcp-ts/redis/server';
import { Redis } from 'ioredis';

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

// In-memory for testing
const memoryStorage = new MemoryStorageBackend();
```

---

## 📊 Backend Comparison

| Feature | <img src="/img/redis.svg" alt="Redis" width="16" height="16" style={{display: 'inline', verticalAlign: 'middle'}} /> Redis | <img src="/img/filesystem.svg" alt="File System" width="16" height="16" style={{display: 'inline', verticalAlign: 'middle'}} /> File System | <img src="/img/memory.svg" alt="Memory" width="16" height="16" style={{display: 'inline', verticalAlign: 'middle'}} /> In-Memory |
|---------|----------|----------------|--------------|
| **Persistence** | ✅ Yes | ✅ Yes | ❌ No |
| **Distributed** | ✅ Yes | ❌ No | ❌ No |
| **Auto-Expiry** | ✅ Yes (TTL) | ❌ No | ❌ No |
| **Performance** | ⚡ Fast | 📊 Medium | 🚀 Fastest |
| **Setup** | 🔧 Requires Redis | 📁 Built-in | 🎯 Built-in |
| **Serverless** | ✅ Yes | ⚠️ Limited | ✅ Yes |
| **Production** | ✅ Recommended | ⚠️ Single-instance | ❌ Not recommended |
| **Development** | ✅ Good | ✅ Excellent | ✅ Good |
| **Testing** | ✅ Good | ✅ Good | ✅ Excellent |

---

## 🔐 Session Data Structure

All backends store the same session data structure:

```typescript
interface SessionData {
  sessionId: string;
  identity?: string;
  serverId?: string;
  serverName?: string;
  serverUrl: string;
  callbackUrl: string;
  transportType: 'sse' | 'streamable_http';
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

---

## 💡 Best Practices

### Production Deployments

```bash
# Use Redis for production
MCP_TS_STORAGE_TYPE=redis
REDIS_URL=rediss://user:pass@production-redis.example.com:6379
```

### Local Development

```bash
# Use File storage for development
MCP_TS_STORAGE_TYPE=file
MCP_TS_STORAGE_FILE=./dev-sessions.json
```

### Testing

```bash
# Use in-memory for tests
MCP_TS_STORAGE_TYPE=memory
```

### Serverless (Vercel, AWS Lambda)

```bash
# Use Redis with Upstash or similar
REDIS_URL=rediss://default:token@serverless-redis.upstash.io:6379
```

---

## 🔍 Troubleshooting

### Redis Connection Failed

```bash
# Verify Redis is running
redis-cli ping  # Should return PONG

# Check connection string
echo $REDIS_URL

# Test with redis-cli
redis-cli -u $REDIS_URL ping
```

### File Storage Not Persisting

```bash
# Check file permissions
ls -la ./sessions.json

# Verify path is writable
touch ./sessions.json

# Check environment variable
echo $MCP_TS_STORAGE_FILE
```

### Sessions Lost on Restart

If you're using in-memory storage (default), sessions will be lost on restart. Switch to Redis or File storage for persistence:

```bash
# Add to .env
MCP_TS_STORAGE_TYPE=file
MCP_TS_STORAGE_FILE=./sessions.json
```

---

## 📚 Next Steps

- [Installation Guide](./installation.md) - Setup instructions
- [API Reference](./api-reference.md) - Complete API documentation
- [Next.js Integration](./nextjs.md) - Framework-specific guides
