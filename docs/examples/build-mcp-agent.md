---
title: "Build an MCP Agent"
sidebarTitle: "Build an MCP Agent"
description: "End-to-end walkthrough for building an MCP-powered AI agent in Next.js: configure session storage, onboard MCP servers with OAuth, and expose tools to the Vercel AI SDK."
icon: "robot"
---

A complete example of wiring MCP into a Next.js app: persistent session storage, server-side server onboarding with OAuth, and an AI chat endpoint that calls the connected tools.

## 1. App Setup

Create a shared `Mcp` instance backed by your session store. Storage backends are exported from `@mcp-ts/client` (or `@mcp-ts/client`).

```typescript title="lib/mcp.ts"
import { Mcp } from '@mcp-ts/client';

export const mcp = new Mcp({
  storage: new SqliteStorage({ path: './sessions.db' }),
});
```

<AccordionGroup>
  <Accordion title="Supabase">
  ```typescript title="lib/mcp.ts"
  import { Mcp } from '@mcp-ts/client';
  import { createClient } from '@supabase/supabase-js';

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
  );

  export const mcp = new Mcp({
    storage: new SupabaseStorageBackend(supabase),
  });
  ```
  </Accordion>

  <Accordion title="Redis">
  ```typescript title="lib/mcp.ts"
  import { Mcp } from '@mcp-ts/client';
  import { Redis } from 'ioredis';

  const redis = new Redis(process.env.REDIS_URL!);

  export const mcp = new Mcp({
    storage: new RedisStorageBackend(redis),
  });
  ```
  </Accordion>
</AccordionGroup>

If you don't configure storage, the exported `mcp` singleton uses in-memory storage (sessions are lost on restart).

## 2. Server-Side Onboarding

### Add an MCP server

```typescript title="app/api/mcp/add/route.ts"
import { NextResponse } from 'next/server';
import { mcp } from '@/lib/mcp';

export async function POST(req: Request) {
  const { userId, serverUrl } = await req.json();

  const result = await mcp.user(userId).addMcpServer(serverUrl, {
    callbackUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/mcp/callback?userId=${userId}`,
  });

  if (result.authRequired) {
    // Redirect the user to authorize the connection
    return NextResponse.json({ authUrl: result.authUrl });
  }

  return NextResponse.json({ success: true, sessionId: result.sessionId });
}
```

### OAuth callback

```typescript title="app/api/mcp/callback/route.ts"
import { NextResponse } from 'next/server';
import { mcp } from '@/lib/mcp';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('userId');
  const code = searchParams.get('code');
  const state = searchParams.get('state');

  if (!userId || !code || !state) {
    return NextResponse.json({ error: 'Missing required params' }, { status: 400 });
  }

  await mcp.user(userId).finishAuth(code, state);

  return NextResponse.json({ success: true });
}
```

## 3. AI Agent

Use `AIAdapter.getTools()` to expose the user's connected MCP tools to the [Vercel AI SDK](https://sdk.vercel.ai/docs).

```typescript title="app/api/chat/route.ts"
import { AIAdapter } from '@mcp-ts/client/adapters/ai';
import { mcp } from '@/lib/mcp';
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';

export async function POST(req: Request) {
  const { messages, userId } = await req.json();

  const connection = mcp.user(userId);
  await connection.connect();

  const tools = await AIAdapter.getTools(connection);

  const result = streamText({
    model: openai('gpt-4o'),
    messages,
    tools,
  });

  return result.toDataStreamResponse();
}
```

## Next Steps

- [Tool Router](/core-concepts/tool-router) — on-demand tool discovery to reduce context bloat
- [Storage Backends](/storage-backends/overview) — all available session stores
- [AI SDK Adapter](/ai-adapters/ai-sdk) — adapter options and configuration
- [Starter Templates](/examples) — runnable example projects
