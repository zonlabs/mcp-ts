---
title: "In-Memory"
sidebarTitle: "In-Memory"
description: "Use the in-memory storage backend for fast, ephemeral MCP session storage in unit tests, integration tests, and local prototypes (lost on restart)."
---

**Fast ephemeral storage, ideal for testing. Sessions are lost on restart.**

In-memory storage keeps sessions in RAM. Best for:
- Unit testing
- Integration testing
- Quick prototyping
- Temporary sessions

### Configuration

```bash
# Explicit selection (optional)
MCP_TS_STORAGE_TYPE=memory

# No additional configuration needed
```

### Usage

### Option 1: Default Usage

The global `sessions` proxy uses the In-Memory backend by default if no other storage environment variables are configured.

```typescript
import { sessions } from '@mcp-ts/client/server';

await sessions.create({
  sessionId: 'test-123',
  userId: 'test-user',
  serverUrl: 'https://test.example.com',
  callbackUrl: 'https://test.com/callback',
  transport: { type: 'streamable-http' },
  status: 'active',
  createdAt: Date.now(),
});
```

### Option 2: Manual Instantiation

```typescript
import { MemoryStorageBackend } from '@mcp-ts/client/server';

const memoryBackend = new MemoryStorageBackend();

await memoryBackend.create({
  sessionId: 'test-123',
  userId: 'test-user',
  serverUrl: 'https://test.example.com',
  callbackUrl: 'https://test.com/callback',
  transport: { type: 'streamable-http' },
  status: 'active',
  createdAt: Date.now(),
});
```
