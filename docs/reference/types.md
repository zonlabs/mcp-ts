---
title: "Types & Errors"
sidebarTitle: "Types"
description: "Core TypeScript types and Error classes for mcp-ts."
icon: "code"
---

### Connection Types

```typescript
import type {
  McpConnectionState,
  McpConnectionEvent,
} from '@mcp-ts/sdk/shared';

type McpConnectionState =
  | 'DISCONNECTED'
  | 'CONNECTING'
  | 'AUTHENTICATING'
  | 'AUTHENTICATED'
  | 'DISCOVERING'
  | 'CONNECTED'
  | 'VALIDATING'
  | 'RECONNECTING'
  | 'FAILED';

type McpConnectionEvent =
  | { type: 'state_changed'; sessionId: string; state: McpConnectionState; /* ... */ }
  | { type: 'tools_discovered'; sessionId: string; tools: Tool[]; /* ... */ }
  | { type: 'auth_required'; sessionId: string; authUrl: string; /* ... */ }
  | { type: 'error'; sessionId: string; error: string; /* ... */ }
  | { type: 'disconnected'; sessionId: string; reason?: string; /* ... */ }
  | { type: 'progress'; sessionId: string; message: string; /* ... */ };
```

### Tool Types

```typescript
import type { ToolInfo } from '@mcp-ts/sdk/shared';

interface ToolInfo {
  name: string;
  description?: string;
  inputSchema: {
    type: 'object';
    properties?: Record<string, any>;
    required?: string[];
  };
  annotations?: ToolAnnotations;
}
```

#### Tool annotations

Tools can advertise hints about their behavior. Adapters and the [`ToolRouter`](/core-concepts/tool-router) read these annotations to decide things like whether a call needs human approval and how to label tools in summaries.

```typescript
interface ToolAnnotations {
  /** Optional human-readable title shown in tool listings. */
  title?: string;
  /** Optional category label used to group tools. */
  category?: string;
  /** Free-form description used for richer surfaces. */
  description?: string;
  /** Audience tags such as ["user"] or ["agent"]. */
  audience?: string[];
  /** Sort priority (lower runs first). */
  priority?: number;
  /** Tool only reads data and has no side effects. */
  readOnlyHint?: boolean;
  /** Tool may delete or overwrite data — adapters require approval by default. */
  destructiveHint?: boolean;
  /** Calling the tool twice with the same args is safe. */
  idempotentHint?: boolean;
  /** Tool reaches outside the local environment (network, third-party APIs). */
  openWorldHint?: boolean;
  /** Additional custom hints. */
  [key: string]: unknown;
}
```

Set `destructiveHint: true` on any tool that mutates user data to opt into the default human-in-the-loop flow used by [`AIAdapter`](/ai-adapters/ai-sdk#human-in-the-loop-approvals).

### Session Types

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

## Error Handling

### UnauthorizedError

Thrown when OAuth authorization is required.

```typescript
import { UnauthorizedError } from '@mcp-ts/sdk/server';

try {
  await client.connect();
} catch (error) {
  if (error instanceof UnauthorizedError) {
    console.log('Redirect to:', error.authUrl);
  }
}
```
