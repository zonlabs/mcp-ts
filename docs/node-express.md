---
title: "Node.js / Express"
sidebarTitle: "Node.js / Express"
description: "Integrate mcp-ts with Node.js and Express: mount the MCP handler, configure authentication and storage, and stream tool calls over SSE from any client."
icon: "node-js"
---

The `@mcp-ts/sdk/server` package provides handlers for standard Node.js and Express applications.

## Server-side setup

### Step 1: Install dependencies

```bash
npm install express @mcp-ts/sdk
```

### Step 2: Create the SSE handler

Create a file named `mcp-handler.ts`:

```typescript
import express from 'express';
import { createSSEHandler } from '@mcp-ts/sdk/server';

const router = express.Router();

router.get('/sse', (req, res) => {
  const userId = req.query.userId as string;

  if (!userId) {
    return res.status(400).json({ error: 'userId required' });
  }

  const sseHandler = createSSEHandler({
    userId,
    heartbeatInterval: 30000,
  });

  return sseHandler(req, res);
});

export default router;
```

### Step 3: Mount the router

In your main `app.ts` or `index.ts`:

```typescript
import express from 'express';
import mcpRouter from './mcp-handler';

const app = express();

app.use('/api/mcp', mcpRouter);

app.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});
```

## Client-side setup

You can use the `@mcp-ts/sdk/client` in any frontend application.

### Using with React

```typescript
import { useMcp } from '@mcp-ts/sdk/client';

export function McpApp() {
  const { connections, connect, status } = useMcp({
    url: 'http://localhost:3000/api/mcp/sse?userId=user-123',
    userId: 'user-123',
  });

  const handleConnect = () => {
    connect({
      serverId: 'my-server',
      serverName: 'Local Server',
      serverUrl: 'http://localhost:8080',
    });
  };

  return (
    <div>
      <h2>Status: {status}</h2>
      <button onClick={handleConnect}>Connect</button>
      {/* Render connections and tools */}
    </div>
  );
}
```

## Environment configuration

Ensure your Express server has access to Redis or another storage backend:

```bash
REDIS_URL=redis://localhost:6379
```

## Next steps

- [Next.js integration](/nextjs)
- [React hook API](/react)
- [Storage overview](/storage-backends/overview)
