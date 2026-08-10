---
title: "Node.js / Express"
sidebarTitle: "Node.js / Express"
description: "Integrate mcp-ts with Node.js and Express: mount the MCP handler, configure authentication and storage, and stream tool calls over SSE from any client."
icon: "node-js"
---

The `@mcp-ts/sdk/server` package provides handlers for standard Node.js and Express applications.

## Server-Side Setup

### Step 1: Install Dependencies

```bash
npm install express @mcp-ts/sdk
```

### Step 2: Create MCP Handler

Create a file named `mcp-handler.ts`:

```typescript
import express from 'express';
import { createSSEHandler } from '@mcp-ts/sdk/server';

const router = express.Router();

const handler = (req: express.Request, res: express.Response) => {
  const userId = req.query.userId as string;

  if (!userId) {
    return res.status(400).json({ error: 'userId required' });
  }

  const sseHandler = createSSEHandler({
    userId,
    heartbeatInterval: 30000,
  });

  return sseHandler(req, res);
};

router.get('/', handler);
router.post('/', handler);

export default router;
```

### Step 3: Mount the Router

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

## Client-Side Setup

You can use the React client in any frontend application that renders React.

### Using with React

```typescript
import { useMcp } from '@mcp-ts/sdk/client/react';

export function McpApp() {
  const { connections, connect, status } = useMcp({
    url: 'http://localhost:3000/api/mcp?userId=user-123',
    userId: 'user-123',
  });

  const handleConnect = () => {
    connect({
      serverId: 'my-server',
      serverName: 'Local Server',
      serverUrl: 'http://localhost:8080',
      callbackUrl: window.location.origin + '/oauth/callback',
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

## Environment Configuration

Ensure your Express server has access to Redis or another storage backend:

```bash
REDIS_URL=redis://localhost:6379
```

## Next Steps

- [Next.js Integration](/nextjs)
- [React Hook API](/react)
- [Storage Overview](/storage-backends/overview)
