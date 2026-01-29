---
title: Express
hide_title: true
---

import { SiExpress } from "react-icons/si";

<h1><SiExpress style={{verticalAlign: 'middle', marginRight: '10px'}} />Express</h1>

Complete guide for integrating mcp-ts with Node.js and Express applications.

## Server-Side Setup

### Step 1: Install Dependencies

```bash
npm install express @mcp-ts/sdk
```

### Step 2: Create SSE Handler

Create a file named `mcp-handler.ts` (or `.js`):

```typescript
import express from 'express';
import { createSSEHandler } from '@mcp-ts/sdk/server';

const router = express.Router();

router.get('/sse', (req, res) => {
  const identity = req.query.identity as string;

  if (!identity) {
    return res.status(400).json({ error: 'identity required' });
  }

  const sseHandler = createSSEHandler({
    identity,
    heartbeatInterval: 30000,
    // Optional: add custom logic here
  });

  return sseHandler(req, res);
});

// For handling RPC requests (connect, callTool, etc.)
router.post('/rpc', express.json(), async (req, res) => {
  // RPC handling logic is typically integrated into the SSE handler 
  // if you use the built-in createSSEHandler POST support.
});

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

You can use the `@mcp-ts/sdk/client` in any frontend application.

### Using with React

```typescript
import { useMcp } from '@mcp-ts/sdk/client';

export function McpApp() {
  const { connections, connect, status } = useMcp({
    url: 'http://localhost:3000/api/mcp/sse?identity=user-123',
    identity: 'user-123',
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
      <h1>Status: {status}</h1>
      <button onClick={handleConnect}>Connect</button>
      {/* Render connections and tools */}
    </div>
  );
}
```

## Environment Configuration

Ensure your Express server has access to Redis:

```bash
REDIS_URL=redis://localhost:6379
```

## Next Steps

- [Next.js Integration](./nextjs.md)
- [React Hook API](./react.md)
- [Storage Backends](./storage-backends.md)
