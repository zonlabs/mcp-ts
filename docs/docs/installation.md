---
sidebar_position: 2
---

# Installation

Get started with mcp-ts in your JavaScript or TypeScript project.

## Prerequisites

Before installing, ensure you have:

- **Node.js 18+** - [Download Node.js](https://nodejs.org/)
- **Redis** - Local or cloud instance ([Redis Cloud](https://redis.com/try-free/), [Upstash](https://upstash.com/))
- **Package manager** - npm, yarn, or pnpm

## Install the Package

Choose your preferred package manager:

```bash npm2yarn
npm install @mcp-ts/redis
```

## Setup Redis

### Option 1: Local Redis

Install and start Redis locally:

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

### Option 2: Cloud Redis

Use a managed Redis service:

- **[Upstash](https://upstash.com/)** - Serverless Redis (recommended for Vercel/serverless)
- **[Redis Cloud](https://redis.com/try-free/)** - Managed Redis by Redis Labs
- **[AWS ElastiCache](https://aws.amazon.com/elasticache/)** - Amazon's Redis service

## Environment Variables

Create a `.env` file in your project root:

```bash
# Redis connection
REDIS_URL=redis://localhost:6379

# Or for cloud Redis (Upstash example)
REDIS_URL=rediss://default:your-password@your-host.upstash.io:6379
```

For Next.js, add to `.env.local`:

```bash
REDIS_URL=redis://localhost:6379
```

## Verify Installation

Test your setup with a simple script:

```typescript
// test-mcp.ts
import { sessionStore } from '@mcp-ts/redis/server';

async function test() {
  const sessionId = sessionStore.generateSessionId();
  console.log('Generated session ID:', sessionId);

  // Test Redis connection
  await sessionStore.saveSession({
    sessionId,
    userId: 'test-user',
    serverId: 'test-server',
    serverName: 'Test Server',
    serverUrl: 'https://example.com',
    callbackUrl: 'https://example.com/callback',
    transportType: 'sse',
    active: true,
  });

  console.log('✓ Redis connection successful!');
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

- [Next.js Integration](./nextjs.md) - Set up with Next.js
- [React Hook](./react-hook.md) - Use the React hook
- [API Reference](./api-reference.md) - Explore the API

## Troubleshooting

### Redis Connection Issues

**Problem**: `Error: Redis connection failed`

**Solution**:
- Verify Redis is running: `redis-cli ping` (should return `PONG`)
- Check `REDIS_URL` environment variable
- Ensure firewall allows port 6379

### Module Resolution Errors

**Problem**: `Cannot find module '@mcp-ts/redis/server'`

**Solution**:
- Clear node_modules: `rm -rf node_modules && npm install`
- Check TypeScript configuration
- Update to latest version: `npm update @mcp-ts/redis`
