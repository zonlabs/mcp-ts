---
title: "Redis"
sidebarTitle: "Redis"
description: "Use Redis as the mcp-ts session storage backend for production and serverless deployments, with automatic TTL, atomic operations, and distributed access."
---

**Recommended for production and serverless deployments.**

Redis provides distributed, persistent storage with automatic TTL (Time To Live) management. Perfect for:
- Production environments
- Serverless deployments (Vercel, AWS Lambda)
- Multi-instance applications
- High-availability setups

## Installation

```bash
npm install @mcp-ts/sdk ioredis
```

## Configuration

```bash
# Explicit selection (optional)
MCP_TS_STORAGE_TYPE=redis

# Redis connection URL (required)
REDIS_URL=redis://localhost:6379

# Or for cloud Redis with TLS
REDIS_URL=rediss://default:password@host.upstash.io:6379
```

## Features

- **Automatic session expiration** (12 hours TTL)
- **Atomic operations** for data consistency
- **Distributed storage** across instances
- **Production-ready scalability**

## Usage

### Option 1: Automatic detection (recommended)

When `REDIS_URL` is present in your environment, the global `sessions` proxy automatically uses the Redis backend.

```typescript
import { sessions } from '@mcp-ts/sdk/server';

// This will use Redis automatically if env vars are set
const sessionId = sessions.generateSessionId();

await sessions.create({
  sessionId,
  userId: 'user-123',
  serverUrl: 'https://mcp.example.com',
  callbackUrl: 'https://app.com/callback',
  transportType: 'sse',
  active: true,
  createdAt: Date.now(),
});
```

### Option 2: Manual instantiation

If you want to manage the Redis client yourself or use multiple storage backends:

```typescript
import Redis from 'ioredis';
import { RedisStorageBackend } from '@mcp-ts/sdk/server';

const redis = new Redis(process.env.REDIS_URL!);
const redisBackend = new RedisStorageBackend(redis);

await redisBackend.create({
  sessionId: 'test-session',
  userId: 'user-123',
  serverUrl: 'https://mcp.example.com',
  callbackUrl: 'https://app.com/callback',
  transportType: 'sse',
  active: true,
  createdAt: Date.now(),
});
```

## Troubleshooting

### Redis connection failed

```bash
# Verify Redis is running
redis-cli ping  # Should return PONG

# Check connection string
echo $REDIS_URL

# Test with redis-cli
redis-cli -u $REDIS_URL ping
```
