---
sidebar_position: 2
---

# Installation

Get started with mcp-ts in your JavaScript or TypeScript project.

## Prerequisites

Before installing, ensure you have:

- **Node.js 18+** - [Download Node.js](https://nodejs.org/)
- **Package manager** - npm, yarn, or pnpm
- **Storage Backend** (optional, defaults to in-memory):
  - <img src="/img/redis.svg" alt="Redis" width="16" height="16" style={{display: 'inline', verticalAlign: 'middle'}} /> **Redis** - For production ([Redis Cloud](https://redis.com/try-free/), [Upstash](https://upstash.com/))
  - <img src="/img/filesystem.svg" alt="File System" width="16" height="16" style={{display: 'inline', verticalAlign: 'middle'}} /> **File System** - Built-in, no setup required
  - <img src="/img/memory.svg" alt="Memory" width="16" height="16" style={{display: 'inline', verticalAlign: 'middle'}} /> **In-Memory** - Built-in, default option
  - <img src="/img/postgres.svg" alt="PostgreSQL" width="16" height="16" style={{display: 'inline', verticalAlign: 'middle'}} /> **PostgreSQL** - Coming soon!

## Install the Package

Choose your preferred package manager:

```bash npm2yarn
npm install @mcp-ts/redis
```

## Configure Storage Backend

The library automatically selects a storage backend based on your environment variables. Choose the option that best fits your needs:

### <img src="/img/redis.svg" alt="Redis" width="20" height="20" style={{display: 'inline', verticalAlign: 'middle'}} /> Option 1: Redis (Production)

**Recommended for production and serverless deployments.**

#### Local Redis Setup

```bash
# macOS (Homebrew)
brew install redis
brew services start redis

# Ubuntu/Debian
sudo apt-get install redis-server
sudo systemctl start redis

# Windows (WSL or Docker)
docker run -d -p 6379:6379 redis:latest
```

#### Cloud Redis Providers

- **[Upstash](https://upstash.com/)** - Serverless Redis (recommended for Vercel/serverless)
- **[Redis Cloud](https://redis.com/try-free/)** - Managed Redis by Redis Labs
- **[AWS ElastiCache](https://aws.amazon.com/elasticache/)** - Amazon's Redis service

#### Environment Configuration

```bash
# Explicit selection (optional)
MCP_TS_STORAGE_TYPE=redis

# Redis connection URL (required)
REDIS_URL=redis://localhost:6379

# Or for cloud Redis (Upstash example)
REDIS_URL=rediss://default:your-password@your-host.upstash.io:6379
```

---

### <img src="/img/filesystem.svg" alt="File System" width="20" height="20" style={{display: 'inline', verticalAlign: 'middle'}} /> Option 2: File System (Development)

**Perfect for local development with persistent sessions across restarts.**

```bash
# Explicit selection (optional)
MCP_TS_STORAGE_TYPE=file

# File path for session storage (required)
MCP_TS_STORAGE_FILE=./sessions.json
```

Sessions are stored as JSON in the specified file. The directory is created automatically if it doesn't exist.

---

### <img src="/img/memory.svg" alt="Memory" width="20" height="20" style={{display: 'inline', verticalAlign: 'middle'}} /> Option 3: In-Memory (Testing)

**Fast ephemeral storage, ideal for testing. Sessions are lost on restart.**

```bash
# Explicit selection (optional)
MCP_TS_STORAGE_TYPE=memory
```

This is the **default** if no storage configuration is provided.

---

### <img src="/img/postgres.svg" alt="PostgreSQL" width="20" height="20" style={{display: 'inline', verticalAlign: 'middle'}} /> PostgreSQL (Coming Soon)

PostgreSQL support is planned for a future release.

---

## Storage Selection Logic

The library uses the following priority:

1. **Explicit**: If `MCP_TS_STORAGE_TYPE` is set, use that backend
2. **Auto-detect Redis**: If `REDIS_URL` is present, use Redis
3. **Auto-detect File**: If `MCP_TS_STORAGE_FILE` is present, use File
4. **Default**: Fall back to In-Memory storage

## Verify Installation

Test your setup with a simple script:

```typescript
// test-mcp.ts
import { storage } from '@mcp-ts/redis/server';

async function test() {
  const sessionId = storage.generateSessionId();
  console.log('Generated session ID:', sessionId);

  // Test storage backend
  await storage.createSession({
    sessionId,
    identity: 'test-user',
    serverId: 'test-server',
    serverName: 'Test Server',
    serverUrl: 'https://example.com',
    callbackUrl: 'https://example.com/callback',
    transportType: 'sse',
    active: true,
    createdAt: Date.now(),
  });

  const session = await storage.getSession('test-user', sessionId);
  console.log('✓ Storage backend working!', session?.serverName);
}

test();
```

Run the test:

```bash
tsx test-mcp.ts
# or
ts-node test-mcp.ts
```

## TypeScript Configuration

If using TypeScript, ensure your `tsconfig.json` includes:

```json
{
  "compilerOptions": {
    "moduleResolution": "bundler", // or "node16"
    "esModuleInterop": true,
    "skipLibCheck": true
  }
}
```

## Next Steps

- [Storage Backends](./storage-backends.md) - Detailed backend comparison
- [Next.js Integration](./nextjs.md) - Set up with Next.js
- [React Hook](./react-hook.md) - Use the React hook
- [API Reference](./api-reference.md) - Explore the API

## Troubleshooting

### Storage Backend Issues

**Problem**: `Error: Redis connection failed`

**Solution** (Redis):
- Verify Redis is running: `redis-cli ping` (should return `PONG`)
- Check `REDIS_URL` environment variable is set correctly
- Ensure firewall allows port 6379
- For cloud Redis, verify credentials and SSL settings

**Problem**: File storage not persisting

**Solution** (File):
- Verify `MCP_TS_STORAGE_FILE` path is writable
- Check directory permissions
- Ensure the parent directory exists (it should be created automatically)

**Problem**: Sessions lost on restart

**Solution**:
- If using in-memory storage (default), this is expected behavior
- Switch to Redis or File storage for persistence
- Set `MCP_TS_STORAGE_TYPE=file` or configure `REDIS_URL`

### Module Resolution Errors

**Problem**: `Cannot find module '@mcp-ts/redis/server'`

**Solution**:
- Clear node_modules: `rm -rf node_modules && npm install`
- Check TypeScript configuration
- Update to latest version: `npm update @mcp-ts/redis`
